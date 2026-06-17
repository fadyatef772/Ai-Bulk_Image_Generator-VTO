import { Router } from 'express';
import multer from 'multer';
import { ImageController, SettingsController } from '../controllers';
import { VTOController } from '../controllers/VTOController';

const upload = multer({
storage: multer.memoryStorage(),
limits: {
fileSize: 20 * 1024 * 1024, // 20MB
files: 1000,
},
fileFilter: (_req, file, cb) => {
const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

```
if (allowed.includes(file.mimetype)) {
  cb(null, true);
} else {
  cb(new Error(`Invalid file type: ${file.mimetype}`));
}
```

},
});

export function createRoutes(
imageController: ImageController,
settingsController: SettingsController,
vtoController?: VTOController
): Router {
const router = Router();

// ── Images ──────────────────────────────────────────────

router.post('/images/upload', upload.array('files', 1000), imageController.upload);
router.get('/images', imageController.getGallery);
router.delete('/images/:id', imageController.deleteJob);
router.post('/images/:id/retry', imageController.retryJob);
router.post('/images/:id/cancel', imageController.cancelJob);

// ── Queue ────────────────────────────────────────────────

router.get('/queue/stats', imageController.getQueueStats);
router.post('/queue/start', imageController.startQueue);
router.post('/queue/pause', imageController.pauseQueue);
router.post('/queue/resume', imageController.resumeQueue);
router.post('/queue/stop', imageController.stopQueue);
router.post('/queue/cancel', imageController.cancelQueue);

// ── Settings ─────────────────────────────────────────────

router.get('/settings', settingsController.getSettings);
router.put('/settings', settingsController.updateSettings);
router.post('/settings/validate-key', settingsController.validateApiKey);
router.post('/settings/select-folder', settingsController.selectOutputFolder);
router.post('/settings/open-folder', settingsController.openOutputFolder);

// ── Virtual Try-On ───────────────────────────────────────

if (vtoController) {
router.post(
'/vto/try-on',
upload.fields([
{ name: 'person', maxCount: 1 },
{ name: 'clothing', maxCount: 1 },
]),
vtoController.tryOn
);

```
router.post(
  '/vto/bulk',
  upload.fields([
    { name: 'person', maxCount: 1 },
    { name: 'clothing', maxCount: 200 },
  ]),
  vtoController.bulkTryOn
);
```

}

// ── Health ───────────────────────────────────────────────

router.get('/health', (_req, res) => {
res.json({
success: true,
status: 'ok',
timestamp: new Date().toISOString(),
});
});

return router;
}
