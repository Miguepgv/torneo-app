type Heic2AnyOptions = {
  blob: Blob;
  toType?: string;
  quality?: number;
  multiple?: boolean;
};

type Heic2AnyFn = (options: Heic2AnyOptions) => Promise<Blob | Blob[]>;

declare global {
  interface Window {
    heic2any?: Heic2AnyFn;
  }
}

export {};
