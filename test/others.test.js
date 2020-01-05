import { Model } from '../src/index.js'

describe('others', () => {
  test('format', async () => {
    class PersonModel extends Model {
      static name = {
        type: String,
        default: '',
      }

      static age = {
        type: Number,
        default: 0,
        getter(value) {
          // ensure string
          return value ? value + '' : ''
        },
        setter(value) {
          // ensure number
          return !isNaN(+value) ? +value : 0
        }
      }
    }
    const person = new PersonModel()

    expect(person.data.age).toBe(0)
    expect(person.state.age).toBe('')

    person.state.age = '12'

    expect(person.state.age).toBe('12')
    expect(person.data.age).toBe(12)

    await person.update({
      name: 'tomy',
      age: '14',
    })

    expect(person.data.age).toBe(14)
  })

  test('message', () => {
    class SomeModel extends Model {
      static some = {
        type: String,
        default: 0,
        message: 'it should be a string',
      }
    }
    const some = new SomeModel()

    some.state.some = 12

    expect(some.view.some.error.message).toBe('it should be a string')
  })
})
