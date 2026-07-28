import { IResearchProvider, IResearchQuery, IResearchSource } from './types';

export class GoogleDeepResearchProvider implements IResearchProvider {
  async search(query: IResearchQuery): Promise<IResearchSource[]> {
    return [];
  }
}

export class ResearchProviderRegistry {
  resolve(providerName: string = 'google'): IResearchProvider {
    if (providerName === 'google') {
      return new GoogleDeepResearchProvider();
    }
    throw new Error(`Unknown research provider requested: ${providerName}`);
  }
}
