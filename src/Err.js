'use strict'

class NotImplementedError extends Error {
  constructor (method, ...args) {
    super(args)
    this.name = 'NotImplementedError'
    this.method = method
  }
}

class InvalidArgumentError extends Error {
  constructor (argument, ...args) {
    super(args)
    this.name = 'InvalidArgumentError'
    this.argument = argument
  }
}

class MissingArgumentError extends Error {
  constructor (argument, ...args) {
    super(args)
    this.name = 'MissingArgumentError'
    this.argument = argument
  }
}

class ConcurrencyError extends Error {
  constructor (...args) {
    super(args)
    this.name = 'ConcurrencyError'
  }
}

class PreconditionError extends Error {
  constructor (message, ...args) {
    super(args)
    this.name = 'PreconditionError'
    this.message = message
  }
}

const notImplemented = method => new NotImplementedError(method)
const invalidArgument = arg => new InvalidArgumentError(arg)
const missingArgument = arg => new MissingArgumentError(arg)
const concurrency = () => new ConcurrencyError()
const precondition = msg => new PreconditionError(msg)
const required = (argName, argValue, argType = 'string') => {
  if (!argValue) throw missingArgument(argName)
  if (typeof argType === 'function') {
    if (!(argValue instanceof argType)) throw invalidArgument(argName)
  } else if(argType === 'array') {
    if (!Array.isArray(argValue)) throw invalidArgument(argName)
  } else if (typeof argValue !== argType) throw invalidArgument(argName)
}

module.exports = {
  NotImplementedError,
  InvalidArgumentError,
  MissingArgumentError,
  ConcurrencyError,
  PreconditionError,
  notImplemented,
  invalidArgument,
  missingArgument,
  concurrency,
  precondition,
  required
}
