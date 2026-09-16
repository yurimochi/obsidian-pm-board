import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";
import prettierRecommended from "eslint-plugin-prettier/recommended";

export default tseslint.config(
	{ ignores: ["main.js", "node_modules/**"] },
	js.configs.recommended,
	tseslint.configs.recommended,
	obsidianmd.configs.recommended,
	prettierRecommended,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node },
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
);
