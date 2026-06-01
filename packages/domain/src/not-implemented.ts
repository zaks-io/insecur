/** Thrown by package interface stubs until a slice implements the seam. */
export class NotImplementedError extends Error {
  readonly seam: string;

  constructor(seam: string) {
    super(`${seam} is not implemented yet`);
    this.name = "NotImplementedError";
    this.seam = seam;
  }
}
