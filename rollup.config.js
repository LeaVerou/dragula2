import { terser } from 'rollup-plugin-terser';
import { getBabelOutputPlugin as babel } from '@rollup/plugin-babel';

function bundle(format, {minify} = {}) {
  let filename = 'dragula';

  if (format !== 'esm') {
    filename += '.' + format;
  }

  if (minify) {
    filename += '.min';
  }

  let plugins = [];

  if (minify) {
    plugins.push(
      babel({
        allowAllFormats: true,
      }),
      terser({
        compress: true,
        mangle: true
      })
    );
  }

  return {
    file: `dist/${filename}.js`,
    name: 'dragula',
    format: format,
    sourcemap: format !== 'esm',
    plugins
  };
}

// Same as a rollup.config.js
export default {
  input: 'src/dragula.js',
  output: [
    bundle('iife'),
    bundle('iife', {minify: true}),
    bundle('esm'),
    bundle('esm', {minify: true}),
    bundle('cjs'),
    bundle('cjs', {minify: true})
  ],
};
