export interface DirectoryUser {
  readonly id: string;
  readonly email: string;
  readonly status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
}

/** Minimal public projection: no credentials, sessions or role management. */
export interface UserDirectoryReader {
  findById(userId: string, lock?: boolean): Promise<DirectoryUser | null>;
  searchIds(search: string): Promise<string[]>;
  eligible(query: {
    search?: string;
    excludedIds: readonly string[];
    page: number;
    pageSize: number;
  }): Promise<{ items: DirectoryUser[]; total: number }>;
}
