class RepositoryError(RuntimeError):
    """Raised when repository operations fail.

    Wraps lower-level exceptions to provide a stable, domain-friendly API.
    """

    pass
