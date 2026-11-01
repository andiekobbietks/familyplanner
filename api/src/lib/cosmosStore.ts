import { Container, CosmosClient } from '@azure/cosmos'
import { DefaultAzureCredential } from '@azure/identity'
import type { Store } from './store'
import type { BaseDoc, DocType } from './types'

/**
 * Cosmos DB NoSQL, one database, one container, partition key /familyId.
 * Connects with a service principal (S18): no account keys anywhere. Every query is
 * parameterised (S15) and scoped to the partition (S16).
 *
 * Filtering beyond `type` happens in the handlers, which is fine at
 * the data volumes in section 8 but is the first thing to push into SQL if
 * RU consumption ever matters.
 */
export class CosmosStore implements Store {
  private constructor(private container: Container) {}

  static async create(endpoint: string): Promise<CosmosStore> {
    const client = new CosmosClient({ endpoint, aadCredentials: new DefaultAzureCredential() })
    const container = client
      .database(process.env.COSMOS_DATABASE ?? 'familyplanner')
      .container(process.env.COSMOS_CONTAINER ?? 'docs')
    return new CosmosStore(container)
  }

  async get<T extends BaseDoc>(familyId: string, id: string, type: DocType) {
    const { resource } = await this.container.item(id, familyId).read<T>()
    return resource?.type === type ? resource : undefined
  }

  async byType<T extends BaseDoc>(familyId: string, type: DocType) {
    const { resources } = await this.container.items
      .query<T>(
        {
          query: 'SELECT * FROM c WHERE c.familyId = @familyId AND c.type = @type',
          parameters: [
            { name: '@familyId', value: familyId },
            { name: '@type', value: type },
          ],
        },
        { partitionKey: familyId },
      )
      .fetchAll()
    return resources
  }

  async upsert<T extends BaseDoc>(doc: T) {
    await this.container.items.upsert(doc)
    return doc
  }

  async delete(familyId: string, id: string) {
    try {
      await this.container.item(id, familyId).delete()
    } catch (e) {
      if ((e as { code?: number }).code !== 404) throw e
    }
  }

  async deleteAll(familyId: string) {
    const { resources } = await this.container.items
      .query<{ id: string }>(
        { query: 'SELECT c.id FROM c WHERE c.familyId = @familyId', parameters: [{ name: '@familyId', value: familyId }] },
        { partitionKey: familyId },
      )
      .fetchAll()
    for (const r of resources) await this.delete(familyId, r.id)
  }
}
