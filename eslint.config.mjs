import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescriptConfig from "eslint-config-next/typescript";

const config = [
  { ignores: [".next/**", "node_modules/**", ".data/**", "next-env.d.ts"] },
  ...coreWebVitals,
  ...typescriptConfig,
  {
    rules: {
      // I messaggi arrivano dal pubblico e finiscono su un maxischermo:
      // l'escaping automatico di React e' l'ultima linea di difesa e non
      // deve poter essere aggirata per distrazione.
      "react/no-danger": "error",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
]

export default config;
