import Type from './type.js'
import Rule from './rule.js'
import { isInstanceOf, isArray } from './utils.js'
import TyError, { makeError } from './error.js'

export class Tuple extends Type {
  constructor(pattern) {
    if (!isArray(pattern)) {
      throw new TyError('Tuple pattern should be an array.')
    }

    super(pattern)
    this.name = 'Tuple'
  }
  assert(value) {
    const pattern = this.pattern
    const info = { value, pattern, type: this, level: 'type', action: 'assert' }

    if (!isArray(value)) {
      throw new TyError('mistaken', info)
    }

    const items = value
    const patterns = pattern
    const patternCount = patterns.length
    const itemCount = items.length

    if (this.mode === 'strict' && itemCount !== patternCount) {
      throw new TyError('dirty', { ...info, length: patternCount })
    }

    for (let i = 0; i < itemCount; i ++) {
      let value = items[i]
      let pattern = patterns[i]
      let _info = { ...info, index: i, value, pattern }

      // rule validate2
      if (isInstanceOf(pattern, Rule)) {
        let error = pattern.validate2(value, i, items)
        if (error) {
          throw makeError(error, _info)
        }
        else {
          continue
        }
      }

      // normal validate
      let error = this.validate(value, pattern)
      if (error) {
        throw makeError(error, _info)
      }
    }
  }
}

export function tuple(pattern) {
  const type = new Tuple(pattern)
  return type
}

export default Tuple
