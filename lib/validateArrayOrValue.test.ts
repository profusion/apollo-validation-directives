import { GraphQLInt, GraphQLList, GraphQLNonNull } from 'graphql';

import validateArrayOrValue from './validateArrayOrValue';

describe('validateArrayOrValue', (): void => {
  const passThru = <T>(x: T): T => x;
  const mockValidate = jest.fn(passThru);

  const GraphQLNonNullInt = new GraphQLNonNull(GraphQLInt);

  const GraphQLIntList = new GraphQLList(GraphQLInt);
  const GraphQLIntListNonNull = new GraphQLList(GraphQLNonNullInt);

  const GraphQLNonNullIntList = new GraphQLNonNull(GraphQLIntList);
  const GraphQLNonNullIntListNonNull = new GraphQLNonNull(
    GraphQLIntListNonNull,
  );
  const GraphQLIntListList = new GraphQLList(GraphQLIntList);

  const value = 123;
  const array = [value, value * 2];

  beforeEach(() => {
    mockValidate.mockReset();
    mockValidate.mockImplementation(passThru);
  });

  it('works with value', (): void => {
    expect(validateArrayOrValue(mockValidate)(value, GraphQLInt)).toBe(value);
    expect(mockValidate).toBeCalledTimes(1);
    expect(mockValidate).toBeCalledWith(value, GraphQLInt);
  });

  it('works with non-null value', (): void => {
    expect(validateArrayOrValue(mockValidate)(value, GraphQLNonNullInt)).toBe(
      value,
    );
    expect(mockValidate).toBeCalledTimes(1);
    expect(mockValidate).toBeCalledWith(value, GraphQLNonNullInt);
  });

  it('works with simple array and list', (): void => {
    // equal not be: array is `map()`, result is a new array
    expect(validateArrayOrValue(mockValidate)(array, GraphQLIntList)).toEqual(
      array,
    );
    expect(mockValidate).toBeCalledTimes(array.length);
    array.forEach(item =>
      expect(mockValidate).toBeCalledWith(item, GraphQLInt),
    );
  });

  it('works with simple array and non-null list type', (): void => {
    expect(
      validateArrayOrValue(mockValidate)(array, GraphQLNonNullIntList),
    ).toEqual(array);
    expect(mockValidate).toBeCalledTimes(array.length);
    array.forEach(item =>
      expect(mockValidate).toBeCalledWith(item, GraphQLInt),
    );
  });

  it('works with simple array and non-null list of non-null type', (): void => {
    expect(
      validateArrayOrValue(mockValidate)(array, GraphQLNonNullIntListNonNull),
    ).toEqual(array);
    expect(mockValidate).toBeCalledTimes(array.length);
    array.forEach(item =>
      expect(mockValidate).toBeCalledWith(item, GraphQLNonNullInt),
    );
  });

  it('works array of array and list of list', (): void => {
    // equal not be: array is `map()`, result is a new array
    expect(
      validateArrayOrValue(mockValidate)([array], GraphQLIntListList),
    ).toEqual([array]);
    expect(mockValidate).toBeCalledTimes(array.length);
    array.forEach(item =>
      expect(mockValidate).toBeCalledWith(item, GraphQLInt),
    );
  });

  it('works with simple array and non-list type', (): void => {
    // this is not expected and GraphQL engine should block it, but
    // let's handle just in case (getListItemType 'GraphQLList' else condition)

    // equal not be: array is `map()`, result is a new array
    expect(validateArrayOrValue(mockValidate)(array, GraphQLInt)).toEqual(
      array,
    );
    expect(mockValidate).toBeCalledTimes(array.length);
    array.forEach(item =>
      expect(mockValidate).toBeCalledWith(item, GraphQLInt),
    );
  });

  it('works without validate function', (): void => {
    expect(validateArrayOrValue(undefined)).toBe(undefined);
  });
});
