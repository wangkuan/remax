import fs from 'fs';
import MagicString from 'magic-string';
import * as babelParser from '@babel/parser';
import traverse from '@babel/traverse';
import * as htmlparser2 from 'htmlparser2';
import { get } from 'lodash';
import { Adapter } from '../../adapters';
import { getPath, pushArray, readFile } from './util';
import { output } from '../../utils/output';

const jsHelpers: string[] = [];

const walk = (jsHelperPath: string) => {
  const jsHelperContent = readFile(jsHelperPath);
  const ast = babelParser.parse(jsHelperContent, {
    sourceType: 'module',
  });

  const extract = ({ node }: any) => {
    const importPath =
      (get(node, 'callee.name') === 'require'
        ? get(node, 'arguments[0].value')
        : '') || get(node, 'source.value');

    if (!importPath) {
      return;
    }

    const absolutePath = getPath(jsHelperPath, importPath);

    pushArray(jsHelpers, absolutePath);

    walk(absolutePath);
  };

  traverse(ast, {
    CallExpression: extract,
    ImportDeclaration: extract,
  });
};

const parseTemplate = (
  filePath: string,
  jsHelper: Adapter['extensions']['jsHelper']
) => {
  const parser = new htmlparser2.Parser({});

  const { tag, src } = jsHelper!;

  const content = readFile(filePath);

  parser._cbs.onopentag = (name, attrs) => {
    if (name === tag && attrs[src]) {
      const jsHelperPath = getPath(filePath, attrs[src]);

      if (!fs.existsSync(jsHelperPath)) {
        output(`\n🚨 文件 ${jsHelperPath} 不存在`, 'red');
        return;
      }

      walk(jsHelperPath);

      pushArray(jsHelpers, jsHelperPath);
    }
  };

  parser.reset();
  parser.write(content);
  parser.end();
};

export default function jsHelper(id: string, adapter: Adapter) {
  const { jsHelper, template } = adapter.extensions;

  if (!jsHelper) {
    return;
  }
  const templatePath = id.replace(/\.js$/, template.extension);

  parseTemplate(templatePath, jsHelper);
}

export const getJsHelpers = () => jsHelpers;

export const asModule = (magicString: MagicString) => (node: any) => {
  if (node?.callee?.name === 'Component') {
    magicString.append('export default {}');
  }
};
