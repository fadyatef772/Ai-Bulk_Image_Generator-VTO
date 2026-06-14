import { IImageGenerationService, ILoggerService } from '../domain/interfaces/index';
import { ApiProvider } from '../domain/entities/Settings';
import { GeminiService } from './gemini/GeminiService';
import { VertexGeminiService } from './vertex/VertexGeminiService';
import { DustService } from './dust/DustService';

/**

* Returns the correct IImageGenerationService based on the active provider.
* Called each time a job is processed so that settings changes take effect
* without a server restart.
  */
  export class ImageGenerationServiceFactory {
  private gemini: GeminiService;
  private vertex: VertexGeminiService;
  private dust: DustService;

constructor(logger: ILoggerService) {
this.gemini = new GeminiService(logger);
this.vertex = new VertexGeminiService(logger);
this.dust = new DustService(logger);
}

getService(provider?: ApiProvider): IImageGenerationService {
const active = (provider || process.env.API_PROVIDER || 'gemini') as ApiProvider;

```
switch (active) {
  case 'vertex':
    return this.vertex;

  case 'dust':
    return this.dust;

  case 'gemini':
  default:
    return this.gemini;
}
```

}

/** Convenience: validate credentials for the given provider */
async validateProvider(provider: ApiProvider): Promise<boolean> {
return this.getService(provider).validateCredentials();
}

/** Expose direct Gemini service for legacy validateApiKey calls */
getGeminiService(): GeminiService {
return this.gemini;
}

/** Expose direct Vertex service for Virtual Try-On */
getVertexService(): VertexGeminiService {
return this.vertex;
}

/** Expose direct Dust service if needed later */
getDustService(): DustService {
return this.dust;
}
}
