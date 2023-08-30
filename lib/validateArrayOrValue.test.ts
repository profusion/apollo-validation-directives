import {
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
} from 'graphql';

import validateArrayOrValue from './validateArrayOrValue.js';

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
  const container = new GraphQLObjectType({
    fields: {},
    name: 'container',
  });
  const context = { theContext: 1234 };
  const resolverInfo: Record<string, unknown> = { aInfo: 42 };
  const resolverSource: Record<string, unknown> = { aSource: 'source' };
  const resolverArguments: Record<string, unknown> = { aArg: 'argument' };

  beforeEach(() => {
    mockValidate.mockReset();
    mockValidate.mockImplementation(passThru);
  });

  it('works with value', (): void => {
    expect(
      validateArrayOrValue(mockValidate)(
        value,
        GraphQLInt,
        container,
        context,
        resolverInfo,
        resolverSource,
        resolverArguments,
      ),
    ).toBe(value);
    expect(mockValidate).toBeCalledTimes(1);
    expect(mockValidate).toBeCalledWith(
      value,
      GraphQLInt,
      container,
      context,
      resolverInfo,
      resolverSource,
      resolverArguments,
    );
  });

  it('works with non-null value', (): void => {
    expect(
      validateArrayOrValue(mockValidate)(
        value,
        GraphQLNonNullInt,
        container,
        context,
        resolverInfo,
        resolverSource,
        resolverArguments,
      ),
    ).toBe(value);
    expect(mockValidate).toBeCalledTimes(1);
    expect(mockValidate).toBeCalledWith(
      value,
      GraphQLNonNullInt,
      container,
      context,
      resolverInfo,
      resolverSource,
      resolverArguments,
    );
  });

  it('works with simple array and list', (): void => {
    // equal not be: array is `map()`, result is a new array
    expect(
      validateArrayOrValue(mockValidate)(
        array,
        GraphQLIntList,
        container,
        context,
        resolverInfo,
        resolverSource,
        resolverArguments,
      ),
    ).toEqual(array);
    expect(mockValidate).toBeCalledTimes(array.length);
    array.forEach(item =>
      expect(mockValidate).toBeCalledWith(
        item,
        GraphQLInt,
        container,
        context,
        resolverInfo,
        resolverSource,
        resolverArguments,
      ),
    );
  });

  it('works with simple array and non-null list type', (): void => {
    expect(
      validateArrayOrValue(mockValidate)(
        array,
        GraphQLNonNullIntList,
        container,
        context,
        resolverInfo,
        resolverSource,
        resolverArguments,
      ),
    ).toEqual(array);
    expect(mockValidate).toBeCalledTimes(array.length);
    array.forEach(item =>
      expect(mockValidate).toBeCalledWith(
        item,
        GraphQLInt,
        container,
        context,
        resolverInfo,
        resolverSource,
        resolverArguments,
      ),
    );
  });

  it('works with simple array and non-null list of non-null type', (): void => {
    expect(
      validateArrayOrValue(mockValidate)(
        array,
        GraphQLNonNullIntListNonNull,
        container,
        context,
        resolverInfo,
        resolverSource,
        resolverArguments,
      ),
    ).toEqual(array);
    expect(mockValidate).toBeCalledTimes(array.length);
    array.forEach(item =>
      expect(mockValidate).toBeCalledWith(
        item,
        GraphQLNonNullInt,
        container,
        context,
        resolverInfo,
        resolverSource,
        resolverArguments,
      ),
    );
  });

  it('works array of array and list of list', (): void => {
    // equal not be: array is `map()`, result is a new array
    expect(
      validateArrayOrValue(mockValidate)(
        [array],
        GraphQLIntListList,
        container,
        context,
        resolverInfo,
        resolverSource,
        resolverArguments,
      ),
    ).toEqual([array]);
    expect(mockValidate).toBeCalledTimes(array.length);
    array.forEach(item =>
      expect(mockValidate).toBeCalledWith(
        item,
        GraphQLInt,
        container,
        context,
        resolverInfo,
        resolverSource,
        resolverArguments,
      ),
    );
  });

  it('works with simple array and non-list type', (): void => {
    // this is not expected and GraphQL engine should block it, but
    // let's handle just in case (getListItemType 'GraphQLList' else condition)

    // equal not be: array is `map()`, result is a new array
    expect(
      validateArrayOrValue(mockValidate)(
        array,
        GraphQLInt,
        container,
        context,
        resolverInfo,
        resolverSource,
        resolverArguments,
      ),
    ).toEqual(array);
    expect(mockValidate).toBeCalledTimes(array.length);
    array.forEach(item =>
      expect(mockValidate).toBeCalledWith(
        item,
        GraphQLInt,
        container,
        context,
        resolverInfo,
        resolverSource,
        resolverArguments,
      ),
    );
  });

  it('works without validate function', (): void => {
    expect(validateArrayOrValue(undefined)).toBe(undefined);
  });
});
