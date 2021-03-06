# Model

A model is a data container which restrict the data's type, structure and change rules.
Model is the most important part of tyshemo, it is widely used in many situations.

## Usage

```js
import { Model, Enum } from 'tyshemo'

class MyModel extends Model {
  static name = {
    default: '',
    type: String,
  }

  static age = {
    default: 0,
    type: Number,
  }

  static sex = {
    default: 'M',
    type: new Enum('M', 'F'),
  }
}
```

As you seen, we create a class extends from Model and define static properties on the class to define each property's schema. Notice that, the basic information is the same with what you learn in [Schema](schema.md).

It supports sub-model too, for example:

```js
class ParentModel extends Model {
  static child = ChildModel // use ChildModel directly, it will be transformed to a schema definition
  static children = [ChildModel] // use as a ChildModel list
}
```

## Schema

You can return an object in `schema` method for a model so that you do not need to define static properties.

```js
class SomeModel extends Model {
  schema() {
    return {
      name: {
        default: '',
        type: String,
      },
      age: {
        default: 0,
        type: Number,
      },
    }
  }
}
```

You should return a pure new object or an instance of `Schema` for schema.

```js
class SomeModel extends Model {
  schema(Schema) {
    class SomeSchema extends Schema {
      isChecked(key, context) {
        return this.$determine(key, 'checked', context)(false)
      }
    }
    return new SomeSchema({
      item: {
        default: 'a',
        checked() {
          return this.item === 'b'
        },
      }
    })
  }

  isItemChecked() {
    return this.$schema.isChecked('item', this)
  }
}
```

## State

When you define a Model, in fact, you are defining a Domain Model. However, Domain Model in some cases need to have dependencies with state, and this state may be changed by business code. So we provide a `state` define way.

```js
class SomeModel extends Model {
  // define state
  state() {
    return {
      isFund: false,
      isInvested: false,
    }
  }

  schema() {
    const some = {
      default: null,
      required() {
        return !this.isFund // use state to check whether need to be required
      },
    }
    return {
      some,
    }
  }
}

const model = new SomeModel({
  isFund: true,
})

// model.isFund === true
// model.isInvested === false

model.set('isFund', false)
```

The properties of state are not in schema, however they are on model, you can update them and trigger watchers. You should not delete them.
`state()` should must return a pure new object, should not be shared from global.
The return state object will be used as default state each time new data restored into model (`init` and `restore`).

## Instance

A Model is an abstract data pattern, to use the model, we should initialize a Model.

```js
const model = new SomeModel() // this will use `default` meta to create values
```

When you initialize, you can pass default data into it.

```js
const model = new SomeModel({
  name: 'tomy',
  age: 10,
}) // other fileds will use `default` meta to create values
```

Then `model` will has the default fields' values. `tomy.name === 'tomy'`.

Now, let's look into the instance, how to use Model to operate data.

### $views

Model instance provides a `$views` property which contains fields information.
Notice, `$views` only contains fields which defined in schema.

```js
const { $views } = model
const { age } = $views

// Here `age` is called 'field view' (short as 'view'). What's on age? =>
// { value, required, disabled, readonly, hidden, errors, ...metas }
```

Why I provide a `$views` property and give structure like this? Because in most cases, we use a field as a single view drived by state.

```html
<label>{{age.label}}</label>
<input v-model="age.value" />
<span v-if="age.required">Required</span>
```

**view.value**

*Notice: Change `value` on a field view will trigger watch callbacks*

**metas()**

Model supports other metas in schema by use `metas` method. For example:

```js
class MyModel extends Model {
  static some = {
    default: '',
    label: 'name',
    placeholder: 'Input Name',
  }

  metas() {
    return ['label', 'placeholder'] // patch `label` and `placeholder` metas into `$views`
  }
}
```

The return value is used to provide other information so that you can find them on `$views`.

```js
const model = new MyModel()
console.log(model.$views.some.label) // name
```

If you want to make a meta force patched into view, you should return an object in `metas`:

```js
class MyModel extends Model {
  static some = {
    default: '',
  }

  metas() {
    return {
      placeholder: null, // set null to be not force used, `placeholder` property is not existing when you have not given
      label: '', // `label` property will always exist on view, if you have not given, it will be an empty string
    }
  }
}

const model = new MyModel()
console.log(model.$views.some.label) // ''
console.log(model.$views.some.placeholder) // undefined
```

**view.errors**

The `errors` property on view is an array.
The array contains errors which are only from `validators`, not contains those from `requried` and type checking.

```js
console.log(model.$views.some.errors) // []
```

**$views.$errors**

`$views.$errros` conbime all `view.errors` together, so that you can easily check whether current model have some fileds which not pass validators.

Notice, `$views.$errors` only contains from `validators` meta, if you want to get all errors which contains `required` and type checking results, you should invoke `model.validate()` method directly.

**view.changed**

For some reason, you may need a state to record changing status. `view.changed` will be true after you change the view's value at the first time.

It is useful in forms:

```html
<label>
  <input v-model="some.value" />
  <span v-if="some.changed && some.errors.length">{{some.errors[0].message}}</span>
</label>
```

In this block code, we show error message only after the value of `some` changed.

### Read

To read data on a model instance, you have 3 ways.

**Field**

Read fields from model instance directly.

```js
const { name, age } = model
```

**get(key)**

Invoke `get` method to read field value.

```js
const name = model.get('name')
```

**view.value**

Read value from a field view.

```js
const age = model.$views.age.value
```

### Update

To update data on a model instance, you have 4 ways too.

**Field**

Set feild value on model directly.

```js
model.age = 20
```

*Notice: Change model properties will trigger watch callbacks*

**set(key, value, force)**

```js
model.set('age', 20)
```

*force* -> when it is set to be true, `set` will ignore `readonly` and `disabled`.

**update(data)**

```js
model.update({
  name: 'tomy',
  age: 30,
})
```

**view.value**

Set value directly to the field view's value.

```js
model.$views.age.value = 40
```

### watch/unwatch

It is the core feature of model to implement reactive.

```js
model.watch('age', (e) => console.log(e), true)
```

Its parameters has bee told in `Store` [here](store.md).

In schema, it supports `watch` meta, which will listen the field's change, and invoke the function.

```js
class MyModel extends Model {
  static some = {
    default: '',
    // when `some` field's value changes, the function will be invoked
    watch({ value }) {
      console.log(value)
    },
  }
}
```

### validate()

```js
const errors = model.validate()
```

The errors contains all validate checking failure errors (contains required checking and type checking and validators checking).

```js
const errors = model.validate(key)
```

This code validate only one field in model.

```js
const errors = model.validate([key1, key2])
```

This code validate only given fields in model.

### Restore

When you want to restore data back to model, you can use `restore` method.

```js
model.restore({
  name: 'tina',
  age: 12,
})
```

*Notice: `restore` will not trigger watchers.*

**onSwitch**

Before restore, a hook method `onSwitch` will be invoked.

```js
class SomeModel extends Model {
  static name = {
    default: '',
    type: String,
  }

  onSwitch(params) {
    if (!params.name) {
      params.name = 'tomy'
    }
  }
}

const model = new SomeModel()
// model.name === 'tomy'
```

So that each time we create a model instance or invoke `restore` method, name will be use default 'tomy'.

**fromJSON**

`restore` method will override the whole model data directly, `fromJSON` method will use `create` meta in schema to create data and then use created data for restore.

```js
model.fromJSON({
  name: 'tina',
  age: 12,
})
```

**onParse**

Before `fromJSON`, a hook method `onParse` will be invoked.

```js
class StudentModel extends Model {
  static name = {
    default: '',
  }

  static age = {
    default: 0,
  }

  onParse(data) {
    return {
      ...data,
      age: +data.age, // I want to make sure the age is a number
    }
  }
}
```

`onParse` is invoked before data comes into model, you chan do some transforming here.

### Export

After all, you want to get whole data for submit to your backend api, you should invoke one of `toJSON` `toParams` or `toFormData` to generate.

```js
const data = model.toJSON()
```

Data here will be generated with `drop` `map` and `flat` metas in schema. Read [here](schema.md) to learn more.

- drop: if drop returns true, it means this field will not in `data`
- map: convert field value to another value
- flat: create new fields in final `data` with current field's value

**onExport**

After generated by schema, a hook mehod `onExport` will be invoked.

```js
class StudentModel extends Model {
  static name = {
    default: '',
  }

  static age = {
    default: 0,
  }

  onExport(data) {
    return {
      ...data,
      length: data.name.length, // patch a undeinfed field before submit to api
    }
  }
}
```

### Lock

In some cases, you want to lock the model, so that any editing will have no effects.

```js
model.lock()
```

Then, updating and restoring will not work.

To unlock:

```js
model.unlock()
```

## Record and replay

```js
// send data to server side
const data = model.$data
await send(data)

// restore data from server side
const data = await fetch()
model.restore(data)
// || const model = new SomeModel(data)
```

## TraceModel

What is a traced model? In some cases, you may face the situation that, in a form, you want to edit some fields in a popup-modal, however, in the modal, you can cancel the edited fileds. In this case, you have to create a temp state in the modal, so that you can drop the data when you click the cancel button. But this make the state management uncomfortable, TraceModel is to fix this situation.

```js
import { TraceModel } from 'tyshemo'
```

TraceModel is extened from Model, so it has all the methods of Model. However, it has some special methods to help you create traced state.

### commit(tag)

When you open the modal, you should create a state mirror by using `commit`:

```js
function onClick() {
  model.commit('edit') // don't use '$origin' as key
  modal.open()
}
```

By this, it will create a state mirror which contains the whole information about this tag.

And now, you can enjoy the validation of model in modal.

```js
function onSubmit() {
  const errors = model.validate(['key1', 'key2', 'key3']) // only validate the keys of which I have edit
  if (errors) {
    popup.show(erros)
    return
  }

  modal.close()
}
```

### reset(tag)

After a while, if you want to cancel the change, just invoke `reset` to recover state.

```js
function onCancel() {
  model.reset('edit')
  modal.close()
}
```

Isn't it easy to do like this?

### undo()

Cancel the previous change.

```js
model.name = 'tomy'
model.undo()
```

### redo()

Cancel the previous undo.

```js
model.name = 'tomy'
model.undo()

///...
model.redo()
```

Notice, `redo` should always follow `undo`, in which there is no state change. If you have changed state after you do `undo`, the history after your change will be clear, so `redo` will not work.

### clear()

Clear all records.
Notice, commits will not be cleared.

```js
model.clear()
mode.undo() // has no effect
model.reset('edit') // works
```
