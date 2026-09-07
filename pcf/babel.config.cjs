// docx ships an arrow/rest super() helper. Transform its enclosing class
// before Babel's parameter transform so the PCF bundle remains compilable.
module.exports = { plugins: [require.resolve('@babel/plugin-transform-classes')] };
