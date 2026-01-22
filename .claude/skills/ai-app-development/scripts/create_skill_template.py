#!/usr/bin/env python3
"""
生成 Skill 模板代码

用法:
    python create_skill_template.py --name <skill名称> --type <类型> --output <输出文件>

示例:
    python create_skill_template.py --name weather_skill --type function --output weather.py
"""

import argparse
from pathlib import Path


FUNCTION_TEMPLATE = '''def {name}({params}) -> {return_type}:
    """
    {description}
    
    Args:
{arg_docs}
    
    Returns:
        {return_description}
    """
    # TODO: 实现功能
    pass
'''

CLASS_TEMPLATE = '''class {name}:
    """
    {description}
    """
    
    def __init__(self{init_params}):
        """
        初始化 {name}
        
        Args:
{init_docs}
        """
        # TODO: 初始化逻辑
        pass
    
    def execute(self{method_params}) -> {return_type}:
        """
        {method_description}
        
        Args:
{method_arg_docs}
        
        Returns:
            {return_description}
        """
        # TODO: 实现逻辑
        pass
'''

ASYNC_TEMPLATE = '''import asyncio

async def {name}({params}) -> {return_type}:
    """
    {description}
    
    Args:
{arg_docs}
    
    Returns:
        {return_description}
    """
    # TODO: 实现异步逻辑
    pass
'''


def generate_function_skill(name: str, description: str, params: list, return_type: str = "dict"):
    """生成函数式 skill"""
    param_str = ", ".join([f"{p['name']}: {p.get('type', 'str')}" for p in params])
    arg_docs = "\n".join([f"        {p['name']}: {p.get('description', '')}" for p in params])
    
    return FUNCTION_TEMPLATE.format(
        name=name,
        params=param_str,
        return_type=return_type,
        description=description,
        arg_docs=arg_docs,
        return_description="执行结果"
    )


def generate_class_skill(name: str, description: str, init_params: list, method_params: list, return_type: str = "dict"):
    """生成类式 skill"""
    init_param_str = ", ".join([f"{p['name']}: {p.get('type', 'str')}" for p in init_params]) if init_params else ""
    if init_param_str:
        init_param_str = ", " + init_param_str
    
    method_param_str = ", ".join([f"{p['name']}: {p.get('type', 'str')}" for p in method_params]) if method_params else ""
    if method_param_str:
        method_param_str = ", " + method_param_str
    
    init_docs = "\n".join([f"            {p['name']}: {p.get('description', '')}" for p in init_params])
    method_arg_docs = "\n".join([f"            {p['name']}: {p.get('description', '')}" for p in method_params])
    
    return CLASS_TEMPLATE.format(
        name=name,
        description=description,
        init_params=init_param_str,
        init_docs=init_docs,
        method_params=method_param_str,
        method_description="执行主要功能",
        method_arg_docs=method_arg_docs,
        return_type=return_type,
        return_description="执行结果"
    )


def generate_async_skill(name: str, description: str, params: list, return_type: str = "dict"):
    """生成异步 skill"""
    param_str = ", ".join([f"{p['name']}: {p.get('type', 'str')}" for p in params])
    arg_docs = "\n".join([f"        {p['name']}: {p.get('description', '')}" for p in params])
    
    return ASYNC_TEMPLATE.format(
        name=name,
        params=param_str,
        return_type=return_type,
        description=description,
        arg_docs=arg_docs,
        return_description="执行结果"
    )


def main():
    parser = argparse.ArgumentParser(description="生成 Skill 模板代码")
    parser.add_argument("--name", required=True, help="Skill 名称")
    parser.add_argument("--type", choices=["function", "class", "async"], default="function", help="Skill 类型")
    parser.add_argument("--description", default="", help="Skill 描述")
    parser.add_argument("--output", help="输出文件路径")
    
    args = parser.parse_args()
    
    # 默认参数
    params = [
        {"name": "input", "type": "str", "description": "输入参数"}
    ]
    
    # 生成代码
    if args.type == "function":
        code = generate_function_skill(args.name, args.description or f"{args.name} skill", params)
    elif args.type == "class":
        code = generate_class_skill(args.name, args.description or f"{args.name} skill", [], params)
    else:  # async
        code = generate_async_skill(args.name, args.description or f"{args.name} skill", params)
    
    # 输出
    if args.output:
        output_path = Path(args.output)
        output_path.write_text(code)
        print(f"Skill 模板已生成: {output_path}")
    else:
        print(code)


if __name__ == "__main__":
    main()
