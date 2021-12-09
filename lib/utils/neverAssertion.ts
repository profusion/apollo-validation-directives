const neverAssertion = (value: never): never => {
  throw new TypeError(`The value ${value} is not accepted by this argument`);
};
export default neverAssertion;
