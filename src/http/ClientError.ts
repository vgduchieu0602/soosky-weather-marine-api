export {
    ClientError as default,
    UnauthorizedError
}

/*----------------------------------------------------------------------------------------*/

class ClientError extends Error {
    constructor (
        message: string,
        public readonly statusCode = 400,
        public readonly code = 'BAD_REQUEST'
    ) {
        super(message)
        this.name = 'ClientError'
    }
}

/*----------------------------------------------------------------------------------------*/

class UnauthorizedError extends ClientError {
    constructor (message = "Unauthorized.") {
        super (message, 401, 'UNAUTHORIZED')
    }
}