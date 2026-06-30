export class MockBuilder {
  private data: any;
  private error: any;

  constructor(data: any = null, error: any = null) {
    this.data = data;
    this.error = error;
  }

  from(table: string) {
    return this;
  }

  select(columns: string = "*") {
    return this;
  }

  insert(data: any) {
    return this;
  }

  update(data: any) {
    return this;
  }

  upsert(data: any, options?: any) {
    return this;
  }

  delete() {
    return this;
  }

  eq(column: string, value: any) {
    return this;
  }

  in(column: string, values: any[]) {
    return this;
  }

  or(filters: string) {
    return this;
  }

  not(column: string, operator: string, value: any) {
    return this;
  }

  contains(column: string, value: any) {
    return this;
  }

  range(from: number, to: number) {
    return this;
  }

  order(column: string, options?: any) {
    return this;
  }

  limit(count: number) {
    return this;
  }

  single() {
    if (Array.isArray(this.data)) {
      this.data = this.data[0];
    }
    return this;
  }

  then(resolve: any, reject: any) {
    resolve({ data: this.data, error: this.error });
  }
}

export class MockAuth {
  private session: any;
  private user: any;
  private error: any;

  constructor(session: any = null, user: any = null, error: any = null) {
    this.session = session;
    this.user = user;
    this.error = error;
  }

  async signUp(credentials: any) {
    return { data: { session: this.session, user: this.user }, error: this.error };
  }

  async signInWithPassword(credentials: any) {
    return { data: { session: this.session, user: this.user }, error: this.error };
  }
}

export class MockSupabaseClient {
  public auth: MockAuth;
  private data: any;
  private error: any;

  constructor(data: any = null, error: any = null, authSession: any = null, authUser: any = null, authError: any = null) {
    this.data = data;
    this.error = error;
    this.auth = new MockAuth(authSession, authUser, authError);
  }

  from(table: string) {
    return new MockBuilder(this.data, this.error);
  }
}
