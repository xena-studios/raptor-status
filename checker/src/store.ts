// Where status.json and history.json go: a public Blob Storage container in
// Azure, or a folder when run locally.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BlobServiceClient, type ContainerClient } from "@azure/storage-blob";

export interface Store {
  read(name: string): Promise<string | null>;
  write(name: string, body: string, cacheSeconds: number): Promise<void>;
}

export class BlobStore implements Store {
  private container: ContainerClient;

  private constructor(container: ContainerClient) {
    this.container = container;
  }

  /** From STATUS_STORAGE_CONNECTION, or STATUS_STORAGE_URL with the Function's managed identity. */
  static async fromEnv(env = process.env): Promise<BlobStore> {
    const name = env.STATUS_CONTAINER || "status";
    if (env.STATUS_STORAGE_CONNECTION) {
      return new BlobStore(BlobServiceClient.fromConnectionString(env.STATUS_STORAGE_CONNECTION).getContainerClient(name));
    }
    if (env.STATUS_STORAGE_URL) {
      const { DefaultAzureCredential } = await import("@azure/identity");
      const client = new BlobServiceClient(env.STATUS_STORAGE_URL, new DefaultAzureCredential());
      return new BlobStore(client.getContainerClient(name));
    }
    throw new Error("Set STATUS_STORAGE_URL (with a managed identity) or STATUS_STORAGE_CONNECTION");
  }

  async read(name: string): Promise<string | null> {
    try {
      const buf = await this.container.getBlockBlobClient(name).downloadToBuffer();
      return buf.toString("utf8");
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 404) return null;
      throw err;
    }
  }

  async write(name: string, body: string, cacheSeconds: number): Promise<void> {
    await this.container.getBlockBlobClient(name).upload(body, Buffer.byteLength(body), {
      blobHTTPHeaders: {
        blobContentType: "application/json; charset=utf-8",
        blobCacheControl: `public, max-age=${cacheSeconds}`,
      },
    });
  }
}

export class FileStore implements Store {
  private dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  async read(name: string): Promise<string | null> {
    try {
      return await readFile(join(this.dir, name), "utf8");
    } catch {
      return null;
    }
  }

  async write(name: string, body: string): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, name), body);
  }
}
