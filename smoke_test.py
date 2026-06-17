"""Functional smoke test — drives the real Container/queue/event pipeline with a
fake provider and an in-memory filesystem stub. No google SDKs or network needed."""
import asyncio
import os
import tempfile

os.environ.setdefault("OUTPUT_DIR", tempfile.mkdtemp(prefix="ai-bulk-out-"))
os.environ.setdefault("LOG_DIR", tempfile.mkdtemp(prefix="ai-bulk-log-"))
os.environ.setdefault("QUEUE_CONCURRENCY", "4")
os.environ.setdefault("QUEUE_RETRY_DELAY", "10")  # ms, keep test fast

from app.domain.interfaces import ImageGenerationResponse
from app.presentation.container import Container


class FakeProvider:
    def __init__(self, fail_first=None):
        self.calls = 0
        self.fail_first = fail_first or set()

    async def generate_image(self, request):
        self.calls += 1
        # Force a transient failure on certain prompts to exercise retry path
        if request.prompt in self.fail_first:
            self.fail_first.discard(request.prompt)
            raise RuntimeError("transient downstream error")
        return ImageGenerationResponse(image_buffer=b"PNGDATA", mime_type="image/png")


class StubFS:
    """Minimal IFileSystemService — no real disk writes for generated output."""
    def __init__(self):
        self.saved = []

    async def read_image_as_buffer(self, path):
        return b"INPUTBYTES"

    async def save_generated_image(self, buf, name, mime, out_dir, sub):
        p = f"{out_dir}/{sub}/{name}.png"
        self.saved.append(p)
        return p

    async def save_failed_record(self, job_id, msg, out_dir):
        return None

    async def ensure_directory_structure(self, folder):
        return None


async def main():
    c = Container()

    # Inject fakes
    fake = FakeProvider(fail_first={"retry-me"})
    c.queue._factory.get_service = lambda: fake
    c.queue._fs = StubFS()

    # Capture events
    seen = {}
    for ev in ["job:started", "job:completed", "job:failed", "job:retrying",
               "stats:updated", "queue:complete", "started"]:
        c.queue.on(ev, (lambda e: (lambda data=None: seen.__setitem__(e, seen.get(e, 0) + 1)))(ev))

    c.events.bind_loop(asyncio.get_running_loop())

    # Create a batch: 5 normal + 1 that fails once then succeeds via retry
    jobs = []
    for i in range(5):
        jobs.append(c.queue.create_job(
            original_path=f"/tmp/in_{i}.png", original_name=f"in_{i}",
            mime_type="image/png", file_size=100, prompt=f"prompt-{i}"))
    jobs.append(c.queue.create_job(
        original_path="/tmp/retry.png", original_name="retry",
        mime_type="image/png", file_size=100, prompt="retry-me"))
    await c.queue.add_jobs(jobs)

    await c.queue.start()

    # Wait for queue drain (max 5s)
    for _ in range(100):
        stats = await c.queue.get_stats()
        if stats.completed + stats.failed >= 6 and stats.processing == 0 and stats.pending == 0:
            break
        await asyncio.sleep(0.05)

    stats = await c.queue.get_stats()
    await c.queue.shutdown()

    print("STATS:", stats.model_dump())
    print("EVENTS:", seen)
    print("FAKE PROVIDER CALLS:", fake.calls)

    assert stats.completed == 6, f"expected 6 completed, got {stats.completed}"
    assert stats.failed == 0, f"expected 0 failed, got {stats.failed}"
    assert seen.get("job:started", 0) >= 6
    assert seen.get("job:completed", 0) == 6
    assert seen.get("job:retrying", 0) >= 1, "retry path did not fire"
    assert fake.calls == 7, f"expected 7 provider calls (6 + 1 retry), got {fake.calls}"
    print("\n*** FUNCTIONAL SMOKE TEST PASSED ***")


asyncio.run(main())
