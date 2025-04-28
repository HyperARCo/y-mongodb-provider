import type { Options } from 'tsup';

export const tsup: Options = {
	entryPoints: ['src/y-mongodb.js'],
	entry: ['src/**/*.js'],
	clean: false,
	format: ['esm', 'cjs'],
	sourcemap: true,
	minify: true,
};
