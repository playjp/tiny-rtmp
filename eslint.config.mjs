import parser from "@typescript-eslint/parser"
import stylistic from "@stylistic/eslint-plugin"

export default [
  {
    languageOptions: { parser },
    plugins: {
      "@stylistic": stylistic
    },
    rules: {
      "@stylistic/eol-last": ["error", "always"],
      "@stylistic/linebreak-style": ["error", "unix"],
      "@stylistic/quotes": ["error", "single"],
      "@stylistic/semi": "error",
      "@stylistic/semi-style": ["error", "last"],
      "@stylistic/indent": ["error", 2],
      "@stylistic/semi-spacing": ["error",  { "before": false, "after": true }],
      "@stylistic/key-spacing": ["error", { "beforeColon": false }],
      "@stylistic/block-spacing": ["error", "always"],
      "@stylistic/space-before-function-paren": ["error", { "anonymous": "always", "named": "never" }],
      "@stylistic/array-bracket-spacing": ["error", "never"],
      "@stylistic/arrow-spacing": ["error", { "before": true, "after": true }],
      "@stylistic/comma-spacing": ["error", { "before": false, "after": true }],
      "@stylistic/comma-dangle": ["error", "always-multiline"],
      "@stylistic/object-curly-spacing": ["error", "always"],
      "@stylistic/function-call-spacing": ["error", "never"],
      "@stylistic/yield-star-spacing": ["error", { "before": false, "after": true }],
      "@stylistic/generator-star-spacing": ["error", { "before": false, "after": true, "method": { "before": true, "after": false }, "anonymous": { "before": true, "after": false }}],
      "@stylistic/type-annotation-spacing": ["error", { "before": true, "after": true, "overrides": { "colon": { "before": false, "after": true }}}],
      "@stylistic/brace-style": ["error", "1tbs", { "allowSingleLine": true }],
    }
  }
]
