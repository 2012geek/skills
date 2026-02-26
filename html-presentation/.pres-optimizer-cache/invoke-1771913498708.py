
import json
import subprocess

# Read prompt
with open("/Users/chenlening/workspace/skills/html-presentation/.pres-optimizer-cache/prompt-1771913498708.txt", "r") as f:
    prompt_content = f.read()

# Prepare request
headers = {
    "x-api-key": "3d92d88d66c348ebadcf4421aa7d6070.b728wHHpnqcbpFcA",
    "anthropic-version": "2023-06-01",
    "content-type": "application/json"
}

data = {
    "model": "GLM-4.7",
    "max_tokens": 4096,
    "temperature": 0.3,
    "messages": [{"role": "user", "content": prompt_content}]
}

# Use curl to make the request
curl_cmd = [
    "curl", "-s", "-X", "POST",
    "https://open.bigmodel.cn/api/anthropic/v1/messages",
    "-H", "x-api-key: 3d92d88d66c348ebadcf4421aa7d6070.b728wHHpnqcbpFcA",
    "-H", "anthropic-version: 2023-06-01",
    "-H", "content-type: application/json",
    "-d", json.dumps(data)
]

try:
    result = subprocess.run(curl_cmd, capture_output=True, text=True, timeout=60)
    if result.returncode != 0:
        print(f"Error: {result.stderr}", file=__import__('sys').stderr)
        __import__('sys').exit(1)

    response = json.loads(result.stdout)
    print(response.get("content", [{}])[0].get("text", ""))
except Exception as e:
    print(f"Error: {e}", file=__import__('sys').stderr)
    __import__('sys').exit(1)
