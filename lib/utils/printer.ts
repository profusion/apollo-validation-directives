import type { ASTNode } from 'graphql';
import { print as defaultPrinter } from 'graphql';

const print = (ast: ASTNode): string => `${defaultPrinter(ast)}\n`;

export default print;
