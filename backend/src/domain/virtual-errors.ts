/** The virtual registry's errors (4S1-BE-01…04), shared by the registry and the bookings. */
export class VirtualInputError extends Error {
  readonly status = 422;
  readonly code = "virtual_input";
  constructor(readonly problems: string[]) {
    super(problems.join(" "));
    this.name = "VirtualInputError";
  }
}

export class VirtualNotFoundError extends Error {
  readonly status = 404;
  readonly code = "virtual_not_found";
  constructor(what = "world") {
    super(`No such ${what}.`);
    this.name = "VirtualNotFoundError";
  }
}

export class VirtualConflictError extends Error {
  readonly status = 409;
  readonly code = "virtual_conflict";
  constructor(message: string) {
    super(message);
    this.name = "VirtualConflictError";
  }
}
