import * as vm from 'vm';

export async function executeJavascript(code: string): Promise<string> {
  return new Promise((resolve) => {
    try {
      const logs: string[] = [];
      const sandbox = {
        console: {
          log: (...args: any[]) => logs.push(args.map(a => String(a)).join(' ')),
          error: (...args: any[]) => logs.push('ERROR: ' + args.map(a => String(a)).join(' ')),
          warn: (...args: any[]) => logs.push('WARN: ' + args.map(a => String(a)).join(' ')),
        },
        Math,
        Date,
        parseInt,
        parseFloat,
        String,
        Number,
        Array,
        Object,
        JSON,
        RegExp,
      };

      const context = vm.createContext(sandbox);
      const script = new vm.Script(code);
      
      // Execute with a timeout to prevent infinite loops
      const result = script.runInContext(context, { timeout: 2000 });
      
      let finalOutput = '';
      if (logs.length > 0) {
        finalOutput += 'Console Output:\n' + logs.join('\n') + '\n\n';
      }
      
      finalOutput += 'Return Value:\n' + (result !== undefined ? String(result) : 'undefined');
      
      resolve(finalOutput.substring(0, 10000));
    } catch (error: any) {
      resolve(`Execution Error: ${error.message}`);
    }
  });
}
