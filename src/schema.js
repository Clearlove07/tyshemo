import {
  isObject,
  isArray,
  isFunction,
  isBoolean,
  isInstanceOf,
  isEmpty,
  each,
  map,
  clone,
  define,
  isString,
  isNumber,
  isUndefined,
  interpolate,
  inObject,
} from 'ts-fns'

import { Ty, Rule } from './ty/index.js'


/**
 * @example const schema = new Schema({
 *   propertyName: {
 *     // required, function to return an object/array
 *     default: '',
 *     // optional, computed property, will compute at each time digest end
 *     // when it is a compute property, it is not able to use set to update value
 *     compute() {
 *       const a = this.a
 *       const b = this.b
 *       return a + '' + b
 *     },
 *
 *     // optional, when passed, `set` action will return prev value if not pass type checking
 *     // notice: `default` and result of `compute` should match type,
 *     // can be rule, i.e. ifexist(String)
 *     type: String,
 *     message: '', // message to return when type checking fail
 *
 *     // optional
 *     validators: [
 *       {
 *         determine: (value) => Boolean, // whether to run this validator, return true to run, false to forbid
 *         validate: (value) => Boolean, // whether to pass the validate, return true to pass, false to not pass and throw error
 *         message: '', // the message of error which throw when validate not pass, can be function to return message dynamicly
 *       },
 *     ],
 *
 *     // optional, function, used by `fromJSON`, `json` is the parameter of `fromJSON`
 *     create: (json, key, value) => !!json.on_market ? json.listing : json.pending,
 *
 *     // optional, function, whether to not use this property when export
 *     drop: (value, key, data) => Boolean,
 *     // optional, function, to override the property value when export, not work when `drop` is false
 *     map: (value, key, data) => newValue,
 *     // optional, function, to assign this result to output data, don't forget to set `drop` to be true if you want to drop original property
 *     flat: (value, key, data) => ({ newProp: newValue }),
 *
 *     // optional, function, format this property value when get
 *     getter: (value) => newValue,
 *     // optional, function, format this property value when set
 *     setter: (value) => value,
 *
 *     // optional, function or boolean or string, use schema.required(field) to check, will be invoked by validate
 *     required: {
 *       // function to determine whether need to be required
 *       determine() { return true },
 *       // when required, what message to notice user
 *       message: 'xx',
 *     },
 *     // optional, function or boolean or string, use schema.readonly(field) to check, will disable set
 *     readonly: { determine, message },
 *     // optional, function or boolean or string, use schema.disabled(field) to check, will disable set/validate, and be dropped when export
 *     // disabled = readonly + drop + no validation
 *     disabled: { determine, message },
 *
 *     // the difference between `disabled` and `readonly`:
 *     // readonly means the property can only be read/validate/export, but could not be changed.
 *     // disabled means the property can only be read, but could not be changed, and will be drop when validate and export
 *
 *     // optional, when an error occurs caused by this property, what to do with the error
 *     catch: (error) => {},
 *   },
 * })
 */
export class Schema {
  constructor(defs) {
    each(defs, (def, key) => {
      if (!isObject(def)) {
        return
      }
      define(this, key, {
        value: def,
        enumerable: true,
      })
    })
  }

  $has(key) {
    return !!this[key]
  }

  /**
   * get default value by using `default` option
   * @param {*} key
   */
  $default(key) {
    const def = this[key]
    const { default: defaultValue } = def
    if (isFunction(defaultValue)) {
      return defaultValue()
    }
    else if (isObject(defaultValue) || isArray(defaultValue)) {
      return clone(defaultValue)
    }
    else {
      return defaultValue
    }
  }

  /**
   * get message for some meta
   * @param {*} key
   * @param {*} meta
   * @param {*} context
   */
  $message(key, meta, context) {
    return (givenMessage) => {
      const def = this[key]

      if (!def) {
        return ''
      }

      const node = def[meta]

      if (!node) {
        return ''
      }

      const defualtMessage = interpolate(Schema.defualtMessages[meta] || `{key} ${meta} error.`, { key })
      const { catch: handle } = def

      let finalMessage = defualtMessage

      if (isString(givenMessage)) {
        finalMessage = givenMessage
      }
      // required: true
      else if (isBoolean(node)) {
        finalMessage = defualtMessage
      }
      // required: 'should be required.'
      else if (isString(node)) {
        finalMessage = node
      }
      // required() { return true }, function to return boolean
      else if (isFunction(node)) {
        finalMessage = defualtMessage
      }
      // required: { ... }
      else if (isObject(node) && node.message) {
        const { message } = node
        // required: { message() { return 'xxx' } }
        if (isFunction(message)) {
          finalMessage = this._trydo(
            () => message.call(context, meta),
            (error) => isFunction(handle) && handle.call(context, error) || defualtMessage,
            {
              key,
              meta: 'message',
            },
          )
        }
        // required: { message: 'required' }
        else if (isString(message)) {
          finalMessage = message
        }
      }

      return finalMessage
    }
  }

  /**
   * get determine result for some meta
   * @param {*} key
   * @param {*} meta
   * @param {*} context
   */
  $determine(key, meta, context) {
    return (fallbackRes) => {
      const def = this[key]

      if (!def) {
        return fallbackRes
      }

      if (!inObject(meta, def)) {
        return fallbackRes
      }

      const node = def[meta]
      const { catch: handle } = def


      /**
       * node is a object like: {
       *   determine: true,
       *   message: '{key} should be required',
       * }
       */
      if (isObject(node)) {
        const { determine } = node
        if (isFunction(determine)) {
          return this._trydo(
            () => determine.call(context),
            (error) => isFunction(handle) && handle.call(context, error) || fallbackRes,
            {
              key,
              meta,
            },
          )
        }
        else {
          return determine
        }
      }

      /**
       * node is a function
       */
      if (isFunction(node)) {
        return this._trydo(
          () => node.call(context),
          (error) => isFunction(handle) && handle.call(context, error) || fallbackRes,
          {
            key,
            meta,
          },
        )
      }

      /**
       * node is a normal value
       */
      return node
    }
  }

  required(key, context) {
    return this.$determine(key, 'required', context)(false)
  }

  disabled(key, context) {
    return this.$determine(key, 'disabled', context)(false)
  }

  readonly(key, context) {
    return this.$determine(key, 'readonly', context)(false)
  }

  get(key, value, context) {
    const def = this[key]

    if (!def) {
      return value
    }

    const { getter, compute, catch: handle } = def
    if (isFunction(compute)) {
      const next = compute.call(context)
      return next
    }

    if (isFunction(getter)) {
      const coming = this._trydo(
        () => getter.call(context, value),
        (error) => isFunction(handle) && handle.call(context, error) || value,
        {
          key,
          meta: 'getter',
        },
      )
      return coming
    }
    else {
      return value
    }
  }

  /**
   * get new value by given value
   * @param {*} key
   * @param {*} value
   * @param {*} context
   */
  $set(key, value, context) {
    const def = this[key]

    if (!def) {
      return value
    }

    const { setter, compute, catch: handle, type, message } = def

    if (compute) {
      this.onError({
        key,
        action: '$set',
        value,
        compute: true,
        message: this.$message(key, 'compute', context)(),
      })
      const next = compute.call(context)
      return next
    }

    if (isFunction(setter)) {
      value = this._trydo(
        () => setter.call(context, value),
        (error) => isFunction(handle) && handle.call(context, error) || value,
        {
          key,
          meta: 'setter',
        },
      )
    }

    // type checking
    if (type) {
      // make rule works
      const target = {}
      if (!isUndefined(value)) {
        Object.assign(target, { [key]: value })
      }
      const error = isInstanceOf(type, Rule) ? Ty.catch(target).by({ [key]: type }) : Ty.catch(value).by(type)
      if (error) {
        this.onError({
          key,
          action: '$set',
          value,
          type: true,
          error,
          message: this.$message(key, 'type', context)(message),
        })
      }
    }

    return value
  }

  /**
   * get new value, with `disabled` `readonly` checking
   * @param {*} key
   * @param {*} next
   * @param {*} prev
   * @param {*} context
   */
  set(key, next, prev, context) {
    const def = this[key]

    if (!def) {
      return next
    }

    const disabled = this.disabled(key, context)
    if (disabled) {
      this.onError({
        key,
        action: 'set',
        next,
        prev,
        disabled: true,
        message: this.$message(key, 'disabled', context)(disabled),
      })
      return prev
    }

    const readonly = this.readonly(key, context)
    if (readonly) {
      this.onError({
        key,
        action: 'set',
        next,
        prev,
        readonly: true,
        message: this.$message(key, 'readonly', context)(readonly),
      })
      return prev
    }

    const value = this.$set(key, next, context)
    return value
  }

  /**
   * create a function to only validate the rules which passed into validators
   * @param {*} key
   * @param {*} value
   * @param {*} context
   * @returns {function}
   */
  $validate(key, value, context) {
    const def = this[key]
    const { catch: handle, validators = [] } = def

    const validate = (validator, index, dontTry) => {
      const { determine, validate, message } = validator

      if (isBoolean(determine) && !determine) {
        return
      }

      if (isFunction(determine)) {
        const bool = this._trydo(
          () => determine.call(context, value, key),
          (error) => isFunction(handle) && handle.call(context, error) || false,
          {
            key,
            meta: 'validators[' + index + '].determine',
          },
          dontTry,
        )
        if (!bool) {
          return
        }
      }

      const res = this._trydo(
        () => validate.call(context, value, key),
        (error) => isFunction(handle) && handle.call(context, error) || true,
        {
          key,
          meta: 'validators[' + index + '].validate',
        },
        dontTry,
      )
      if (isBoolean(res) && res) {
        return
      }

      // if the validate result is an array, it may the submodel return the validate error directly
      if (isArray(res)) {
        errors.push(...res)
        return
      }

      let msg = ''
      if (isInstanceOf(res, Error)) {
        msg = res.message
      }

      if (isFunction(message)) {
        msg = this._trydo(
          () => message.call(context, value, key, res),
          (error) => isFunction(handle) && handle.call(context, error) || msg || `${key} did not pass validators[${index}]`,
          {
            key,
            meta: 'validators[' + index + '].message',
          },
          dontTry,
        )
      }

      if (!msg && isString(message)) {
        msg = message
      }

      const error = {
        key,
        value,
        at: index,
        message: msg,
      }
      return error
    }

    const runOne = (dontTry, validators, i, errors) => {
      const validator = validators[i]
      if (!validator) {
        return
      }

      const error = validate(validator, i, dontTry)
      if (error) {
        errors.push(error)
      }
    }

    const validateByRange = (dontTry, validators, [start = 0, end = validators.length - 1]) => {
      const errors = []
      for (let i = start; i <= end; i ++) {
        runOne(dontTry, validators, i, errors)
      }
      return errors
    }

    const validateByIndexes = (dontTry, validators, ...indexes) => {
      const errors = []
      indexes.forEach((i) => {
        runOne(dontTry, validators, i, errors)
      })
      return errors
    }

    return (...args) => {
      // ignore if disabled
      if (this.disabled(key, context)) {
        return []
      }

      const first = args[0]
      // array, pass custom valiators which is not in schema, i.e. schema.$validate('some', value, model)([{ validate: v => v > 0, message: 'should > 0' }])
      if (isArray(first) && first[0] && typeof first[0] === 'object') {
        return validateByRange(1, first, [])
      }
      // array, i.e. schema.$validate('some', value, model)([2, 6])
      else if (isArray(first)) {
        return validateByRange(0, validators, first)
      }
      // number, i.e. schema.$validate('some', value, model)(1, 2, 4, 6)
      else if (isNumber(first)) {
        return validateByIndexes(0, validators, ...args)
      }
      else {
        return []
      }
    }
  }

  /**
   * validate type and vaidators
   * @param {*} key
   * @param {*} value
   * @param {*} context
   */
  validate(key, value, context) {
    const def = this[key]
    const errors = []

    if (!def) {
      errors.push({
        key,
        value,
        message: `${key} is not existing in schema.`,
      })
      return errors
    }

    // ignore if disabled
    if (this.disabled(key, context)) {
      return errors
    }

    // if required is set, it should check before validators
    const required = this.required(key, context)
    if (required && isEmpty(value)) {
      errors.push({
        key,
        value,
        required: true,
        message: this.$message(key, 'required', context)(required),
      })

      return errors
    }

    const { type, message } = def
    // type checking
    if (type) {
      // make rule works
      const target = {}
      if (!isUndefined(value)) {
        Object.assign(target, { [key]: value })
      }
      const error = isInstanceOf(type, Rule) ? Ty.catch(target).by({ [key]: type }) : Ty.catch(value).by(type)
      if (error) {
        errors.push({
          key,
          value,
          type: true,
          error,
          message: this.$message(key, 'type', context)(message),
        })
      }
    }

    const errs = this.$validate(key, value, context)([])
    errors.push(...errs)

    return errors
  }

  /**
   * parse data by passed data with `create` option, you'd better to call ensure to after parse to make sure your data is fix with type
   * @param {*} data
   * @param {*} context
   */
  parse(data, context) {
    const output = map(this, (def, key) => {
      const { create, catch: handle, type, message } = def
      const value = data[key]

      let coming = value

      if (isFunction(create)) {
        coming = this._trydo(
          () => create.call(context, data, key, value),
          (error) => isFunction(handle) && handle.call(context, error) || value,
          {
            key,
            meta: 'create',
          },
        )
      }

      if (isUndefined(coming)) {
        coming = this.$default(key)
      }

      // check type, and throw error if it is not match the type
      if (type) {
        const target = {}
        if (!isUndefined(coming)) {
          Object.assign(target, { [key]: coming })
        }
        const error = isInstanceOf(type, Rule) ? Ty.catch(target).by({ [key]: type }) : Ty.catch(coming).by(type)
        if (error) {
          this.onError({
            key,
            action: 'parse',
            value: coming,
            type: true,
            error,
            message: this.$message(key, 'type', context)(message),
          })
        }
      }

      return coming
    })
    return output
  }

  /**
   * export to get output data
   * @param {*} data
   * @param {*} context
   */
  export(data, context) {
    const patch = {}
    const output = {}

    each(this, (def, key) => {
      const { drop, map, flat, catch: handle } = def
      const value = data[key]

      if (isFunction(flat)) {
        const res = this._trydo(
          () => flat.call(context, value, key, data) || {},
          (error) => isFunction(handle) && handle.call(context, error) || {},
          {
            key,
            meta: 'flat',
          },
        )
        Object.assign(patch, res)
      }

      // drop if disabled
      if (this.disabled(key, context)) {
        return
      }

      if (isBoolean(drop) && drop) {
        return
      }

      if (isFunction(drop)) {
        const bool = this._trydo(
          () => drop.call(context, value, key, data),
          (error) => isFunction(handle) && handle.call(context, error) || false,
          {
            key,
            meta: 'drop',
          },
        )
        if (bool) {
          return
        }
      }

      if (isFunction(map)) {
        const res = this._trydo(
          () => map.call(context, value, key, data),
          (error) => isFunction(handle) && handle.call(context, error) || value,
          {
            key,
            meta: 'map',
          },
        )
        output[key] = res
      }
      else {
        output[key] = value
      }
    })

    const result = Object.assign(output, patch)
    return result
  }

  _trydo(fn, fallback, basic, force) {
    if (force) {
      return fn()
    }

    try {
      return fn()
    }
    catch (error) {
      const err = {
        ...basic,
        error,
      }
      const e = this.onError(err) || err
      return fallback(e)
    }
  }

  onError() {}

  static defualtMessages = {
    type: `{key} does not match type.`,
    compute: `{key} can not be set new value because it is a computed property.`,
    required: `{key} is required, but receive empty.`,
    readonly: `{key} can not be set new value because of readonly.`,
    disabled: `{key} can not be set new value because of disabled.`,
  }
}
export default Schema
