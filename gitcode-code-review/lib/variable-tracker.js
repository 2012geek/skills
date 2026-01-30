/**
 * 变量定义追踪工具
 * 用于验证变量是否在使用点已被定义
 */

class VariableTracker {
  /**
   * 分析代码，找出变量的定义位置
   * @param {string} code - 完整的文件内容
   * @param {string} variableName - 要查找的变量名
   * @param {number} useLine - 使用该变量的行号（从1开始）
   * @returns {Object} 追踪结果
   */
  static trackVariable(code, variableName, useLine) {
    const lines = code.split('\n');
    const result = {
      found: false,
      definitionLine: null,
      definitionType: null, // 'assignment', 'function_param', 'loop_var', 'import'
      scope: null,
      confidence: 0
    };

    // 向上搜索：从 useLine - 1 开始向上查找
    let currentScope = this.determineCurrentScope(lines, useLine);

    for (let i = useLine - 2; i >= 0; i--) {
      const line = lines[i].trim();

      // 跳过空行和注释
      if (!line || line.startsWith('#') || line.startsWith('//')) {
        continue;
      }

      // 检查是否离开了当前作用域
      if (this.leftScope(lines, i, currentScope)) {
        break;
      }

      // 检查变量赋值
      const assignMatch = line.match(new RegExp(`\\b${variableName}\\s*=`));
      if (assignMatch) {
        result.found = true;
        result.definitionLine = i + 1;
        result.definitionType = 'assignment';
        result.scope = currentScope;
        result.confidence = 95;
        break;
      }

      // 检查循环变量 (for x in, for x in range())
      const loopMatch = line.match(new RegExp(`for\\s+\\b${variableName}\\s+in`));
      if (loopMatch) {
        result.found = true;
        result.definitionLine = i + 1;
        result.definitionType = 'loop_var';
        result.scope = currentScope;
        result.confidence = 95;
        break;
      }

      // 检查函数参数
      const funcMatch = line.match(/def\s+\w+\s*\(([^)]+)\)/);
      if (funcMatch) {
        const params = funcMatch[1].split(',').map(p => p.trim().split(/\s+/)[0]);
        if (params.includes(variableName)) {
          result.found = true;
          result.definitionLine = i + 1;
          result.definitionType = 'function_param';
          result.scope = 'function';
          result.confidence = 95;
          break;
        }
      }
    }

    return result;
  }

  /**
   * 确定当前代码所在的作用域
   */
  static determineCurrentScope(lines, lineNum) {
    let scope = 'module';
    let braceCount = 0;

    for (let i = 0; i < lineNum - 1; i++) {
      const line = lines[i];

      // 统计大括号（用于类/函数作用域）
      for (const char of line) {
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;
      }

      // 检查函数定义
      if (line.match(/def\s+\w+\s*\(/)) {
        scope = 'function';
      }

      // 检查类定义
      if (line.match(/class\s+\w+/)) {
        scope = 'class';
      }
    }

    return scope;
  }

  /**
   * 检查是否离开了当前作用域
   */
  static leftScope(lines, currentLine, scope) {
    // 简化版作用域检查
    // 实际实现需要更复杂的语法分析
    return false;
  }

  /**
   * 构建变量定义图谱
   * @param {string} code - 完整的文件内容
   * @returns {Map} 变量名 -> 定义信息
   */
  static buildVariableMap(code) {
    const variableMap = new Map();
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // 跳过注释和空行
      if (!line || line.startsWith('#') || line.startsWith('//')) {
        continue;
      }

      // 查找赋值语句
      const assignMatch = line.match(/(\w+)\s*=/);
      if (assignMatch && !line.includes('==') && !line.includes('!=')) {
        const varName = assignMatch[1];

        // 检查是否是函数定义
        if (varName === 'def' || varName === 'class' || varName === 'if' || varName === 'for' || varName === 'while') {
          continue;
        }

        if (!variableMap.has(varName)) {
          variableMap.set(varName, []);
        }

        variableMap.get(varName).push({
          line: i + 1,
          type: 'assignment'
        });
      }

      // 查找循环变量
      const loopMatch = line.match(/for\s+(\w+)\s+in/);
      if (loopMatch) {
        const varName = loopMatch[1];

        if (!variableMap.has(varName)) {
          variableMap.set(varName, []);
        }

        variableMap.get(varName).push({
          line: i + 1,
          type: 'loop_var',
          scopeEnd: this.findLoopEnd(lines, i)
        });
      }

      // 查找函数参数
      const funcMatch = line.match(/def\s+(\w+)\s*\(([^)]*)\)/);
      if (funcMatch) {
        const funcName = funcMatch[1];
        const params = funcMatch[2].split(',').map(p => p.trim().split(/\s+/)[0]);

        for (const param of params) {
          if (param) {
            if (!variableMap.has(param)) {
              variableMap.set(param, []);
            }

            variableMap.get(param).push({
              line: i + 1,
              type: 'function_param',
              functionName: funcName,
              scopeEnd: this.findFunctionEnd(lines, i)
            });
          }
        }
      }
    }

    return variableMap;
  }

  /**
   * 查找循环的结束位置
   */
  static findLoopEnd(lines, loopStartLine) {
    // 简化版：查找循环体的结束
    // 实际需要完整的语法分析
    return loopStartLine + 10; // 估算
  }

  /**
   * 查找函数的结束位置
   */
  static findFunctionEnd(lines, funcStartLine) {
    // 简化版：查找函数体的结束
    // 实际需要完整的语法分析
    return funcStartLine + 50; // 估算
  }

  /**
   * 验证变量是否在使用点已定义
   * @param {string} code - 完整的文件内容
   * @param {string} variableName - 变量名
   * @param {number} useLine - 使用行号
   * @returns {Object} 验证结果
   */
  static validateVariable(code, variableName, useLine) {
    const variableMap = this.buildVariableMap(code);
    const definitions = variableMap.get(variableName) || [];

    // 查找在使用点之前的有效定义
    for (const def of definitions) {
      if (def.line < useLine) {
        // 检查定义是否仍然有效（考虑作用域）
        if (def.scopeEnd && def.scopeEnd < useLine) {
          continue; // 定义已过期
        }

        return {
          valid: true,
          definitionLine: def.line,
          definitionType: def.type,
          confidence: 90
        };
      }
    }

    // 未找到定义
    return {
      valid: false,
      confidence: 80
    };
  }
}

module.exports = { VariableTracker };
