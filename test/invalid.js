const { Aggregate, IEventHandler, Err } = require('../index')

class InvalidAggregate extends Aggregate {
  constructor() {
    super()
  }

  get commands () { 
    return { 
      InvalidCommand: async context => {},
      InvalidCommand3: async context => {
        if (context.payload.a <= context.payload.b) throw Err.precondition('a must be greater than b')
      }
    } 
  }
}

class InvalidAggregate2 extends Aggregate {
  constructor() {
    super()
  }

  get commands () { 
    return { 
      InvalidCommand: async () => {}
    }
  }
}

class InvalidHandler extends IEventHandler {
  constructor() {
    super()
  }
}

module.exports = {
  InvalidAggregate,
  InvalidAggregate2,
  InvalidHandler
}
