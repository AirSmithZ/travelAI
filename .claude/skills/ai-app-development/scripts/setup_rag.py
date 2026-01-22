#!/usr/bin/env python3
"""
快速搭建 RAG 系统的脚本

用法:
    python setup_rag.py --documents <文档路径> --output <输出目录>

示例:
    python setup_rag.py --documents ./docs --output ./rag_system
"""

import argparse
import os
from pathlib import Path
from langchain.document_loaders import TextLoader, PyPDFLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.embeddings import OpenAIEmbeddings
from langchain.vectorstores import Chroma


def load_documents(doc_path: str):
    """加载文档"""
    documents = []
    doc_path = Path(doc_path)
    
    if doc_path.is_file():
        # 单个文件
        if doc_path.suffix == '.pdf':
            loader = PyPDFLoader(str(doc_path))
        else:
            loader = TextLoader(str(doc_path))
        documents.extend(loader.load())
    elif doc_path.is_dir():
        # 目录
        for file_path in doc_path.rglob('*'):
            if file_path.suffix == '.pdf':
                loader = PyPDFLoader(str(file_path))
                documents.extend(loader.load())
            elif file_path.suffix in ['.txt', '.md']:
                loader = TextLoader(str(file_path))
                documents.extend(loader.load())
    
    return documents


def create_rag_system(documents, output_dir: str, chunk_size: int = 1000, chunk_overlap: int = 200):
    """创建 RAG 系统"""
    print(f"加载了 {len(documents)} 个文档")
    
    # 分块
    print("正在分块文档...")
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap
    )
    chunks = text_splitter.split_documents(documents)
    print(f"文档已分为 {len(chunks)} 个块")
    
    # 创建嵌入
    print("正在创建向量嵌入...")
    embeddings = OpenAIEmbeddings()
    
    # 创建向量存储
    print("正在创建向量数据库...")
    vectorstore = Chroma.from_documents(
        documents=chunks,
        embedding=embeddings,
        persist_directory=output_dir
    )
    
    print(f"RAG 系统已创建在: {output_dir}")
    return vectorstore


def main():
    parser = argparse.ArgumentParser(description="快速搭建 RAG 系统")
    parser.add_argument("--documents", required=True, help="文档路径（文件或目录）")
    parser.add_argument("--output", required=True, help="输出目录")
    parser.add_argument("--chunk-size", type=int, default=1000, help="分块大小")
    parser.add_argument("--chunk-overlap", type=int, default=200, help="分块重叠大小")
    
    args = parser.parse_args()
    
    # 检查 API 密钥
    if not os.getenv("OPENAI_API_KEY"):
        print("错误: 请设置 OPENAI_API_KEY 环境变量")
        return
    
    # 加载文档
    documents = load_documents(args.documents)
    if not documents:
        print("错误: 未找到文档")
        return
    
    # 创建 RAG 系统
    create_rag_system(
        documents,
        args.output,
        args.chunk_size,
        args.chunk_overlap
    )


if __name__ == "__main__":
    main()
