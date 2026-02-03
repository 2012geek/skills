#!/usr/bin/env python3
import re

# Read the file
with open('.slidev-v4-temp.md', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace image paths: src="/images/{uuid}" -> src="/images/{uuid}.png"
content = re.sub(r'src="/images/([a-f0-9-]{36})"', r'src="/images/\1.png"', content)

# Write back
with open('.slidev-v4-temp.md', 'w', encoding='utf-8') as f:
    f.write(content)

print("✅ 图片路径已更新")
