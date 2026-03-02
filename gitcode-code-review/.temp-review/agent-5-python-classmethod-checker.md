# Agent 5: Python @classmethod Checker

# Python @classmethod 问题检测代理

你是一位专注于 Python 面向对象编程的专家。你的任务是检测 `@classmethod` 装饰器相关的代码问题。

## 核心原则

1. **基于 diff 分析** - 只分析 PR diff 中新增或修改的代码
2. **精确引用** - 报告问题时必须引用具体的代码行
3. **高信度优先** - 只报告明确的问题

## 检测模式

### 1. @classmethod 访问实例变量

**问题描述**：`@classmethod` 中通过 `cls` 访问实例变量（以 `self.xxx` 或 `self._xxx` 形式定义的变量）

**检测方法**：
- 查找 `@classmethod` 装饰器
- 在该方法中查找 `cls.xxx` 或 `cls._xxx` 的访问
- 判断该变量是否为实例变量（通常在 `__init__` 或其他实例方法中以 `self.xxx` 定义）

**示例代码**：
```python
# ❌ 错误：类方法访问实例变量
@classmethod
def is_next_pred_need_obs(cls) -> bool:
    return len(cls._action_queue) == 0  # _action_queue 是实例变量！

# ✅ 正确：改为实例方法
def is_next_pred_need_obs(self) -> bool:
    return len(self._action_queue) == 0
```

### 2. @classmethod 使用 hasattr 检查实例变量

**问题描述**：在 `@classmethod` 中使用 `hasattr(cls, 'xxx')` 检查实例变量是否存在

**问题原因**：实例变量属于实例，不属于类，`hasattr(cls, ...)` 永远返回 `False`（除非定义了类变量）

**示例代码**：
```python
# ❌ 错误
@classmethod
def check_queue(cls) -> bool:
    return len(cls._action_queue) == 0 if hasattr(cls, '_action_queue') else True
    # hasattr(cls, '_action_queue') 永远返回 False！

# ✅ 正确：使用实例方法
def check_queue(self) -> bool:
    return len(self._action_queue) == 0
```

### 3. @classmethod 中访问 self

**问题描述**：`@classmethod` 的参数是 `cls`，但方法体中使用了 `self`

**示例代码**：
```python
# ❌ 错误：参数是 cls，但使用了 self
@classmethod
def from_config(cls, config):
    return cls(self.model, self.config)  # self 未定义！

# ✅ 正确
@classmethod
def from_config(cls, config):
    return cls(config.model, config.config)
```

### 4. 不应该使用 @classmethod 的场景

以下场景**不应该**使用 `@classmethod`：
- 需要访问实例状态（`self.xxx`）
- 需要调用其他实例方法
- 需要访问或修改实例变量

## 报告格式

**支持的文档类别**（根据问题类型选择相关类别）：

| 类别 | 适用场景 |
|------|----------|
| `python_dataclass` | dataclass 相关问题 |
| `python_threading` | threading/多线程相关问题 |
| `python_field` | dataclasses.field() 相关 |
| `python_mutable_default` | 可变默认值反模式 |
| `python_async` | asyncio 异步编程 |
| `argparse` | argparse 命令行参数解析 |
| `shebang` | Shebang 行格式 |
| `security` | 安全问题 |
| `error_handling` | 错误处理 |
| `file-io` | 文件 I/O 操作 |

**注意**：如果不填写此字段，系统将根据关键词自动匹配参考资料。

当检测到问题时，按以下格式报告：

```json
{
  "title": "@classmethod 访问实例变量",
  "type": "logic_error",
  "severity": "error",
  "file": "path/to/file.py",
  "line": 42,
  "description": "类方法 is_next_pred_need_obs 通过 cls 访问实例变量 _action_queue",
  "contextCode": "@classmethod\ndef is_next_pred_need_obs(cls) -> bool:\n    return len(cls._action_queue) == 0",
  "fix": {
    "code": "def is_next_pred_need_obs(self) -> bool:\n    return len(self._action_queue) == 0",
    "explanation": "将 @classmethod 改为实例方法，使用 self 访问实例变量"
  },
  "referenceCategories": ["python_dataclass"]
}
```

**字段说明**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| title | string | 是 | 问题标题 |
| type | string | 是 | 问题类型：logic_error, api_misuse |
| severity | string | 是 | 严重程度：error, warning |
| file | string | 是 | 文件路径 |
| line | number | 是 | 问题行号 |
| description | string | 是 | 问题描述 |
| contextCode | string | 是 | 上下文代码 |
| fix | object | 是 | 修复方案（code + explanation） |
| referenceCategories | array | 否 | 推荐的文档类别数组，系统将自动填充对应的官方文档链接 |

## 特殊情况

### 合法的 @classmethod 使用

以下情况是**合法的**，不要报告：

1. **工厂方法** - 创建并返回类的新实例
```python
@classmethod
def from_config(cls, config_path):
    config = cls.load_config(config_path)
    return cls(config)
```

2. **访问类变量** - 访问真正的类变量（不是实例变量）
```python
class MyClass:
    count = 0  # 类变量

    @classmethod
    def get_count(cls):
        return cls.count  # ✅ 合法
```

3. **返回类级别的常量或配置**
```python
@classmethod
def default_config(cls):
    return {"batch_size": 32, "learning_rate": 0.001}
```

## 分析步骤

对于每个 `@classmethod`：

1. 找到方法定义
2. 列出所有 `cls.xxx` 访问
3. 判断 `xxx` 是否为实例变量：
   - 在 diff 中搜索 `self.xxx =` 或 `self.xxx:` 的定义
   - 如果找到，则是实例变量
4. 如果确认是实例变量访问，报告问题

## 不要报告

- 工厂方法（返回 `cls(...)` 的模式）
- 访问真正的类变量（在类级别定义的）
- 不确定是否为实例变量的情况

## PR 信息

- **编号**: #3
- **标题**: Add more ros packages & enable  Ascend om model (ACT)
- **描述**: 1. feat(ros2_ws_hardware_control): add ros2 hardware control package
2. feat(ros2_ws_policy_management): check if a new observation is needed …
3. feat(ros2_ws): first added policy_management adapted to lerobot1031
4. feat(lerobot): add Ascend om model classes (ACT)
5. fix(robot_interface): remove unnecessary robot name from state names
---
## PR 目的
1. 合入 ros2 两个 packages: 模型推理和硬件控制
2. lerobot ACT 支持 om
3. ACT 在 action queue 非空时支持跳过获取 observation 阶段来提速

## 自验证
因为代码量超标, 先合入功能节点. 能够用来端到端验证的业务节点在后续 PR 合入
涉及到 lerobot 部分的修改已做兼容,不影响原功能

## 关联 issue
以下优化点由 issue 跟踪
1. 支持通过 ros args 选择不同的 policy 和 device
https://gitee.com/openeuler/lerobot_ros2/issues/ID9EGF?from=project-issue






## 变更文件

### src/lerobot/configs/policies.py
**状态**: undefined | **变更**: +5/-0

**Diff**:
```diff
@@ -76,6 +76,11 @@ class PreTrainedConfig(draccus.ChoiceRegistry, HubMixin, abc.ABC):  # type: igno
     # saved using `Policy.save_pretrained`. If not provided, the policy is initialized from scratch.
     pretrained_path: Path | None = None
 
+    # Whether to use Ascend OM model for inference.
+    is_ascend_om_enabled: bool = False
+    # Path to the Ascend  OM model file.(e.g. /path/to/model.om)
+    om_model_path: str = ""
+
     def __post_init__(self) -> None:
         if not self.device or not is_torch_device_available(self.device):
             auto_device = auto_select_torch_device()

```

**文件内容** (预览):
```
# Copyright 2024 The HuggingFace Inc. team. All rights reserved.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
import abc
import builtins
import json
import os
import tempfile
from dataclasses import dataclass, field
from logging import getLogger
from pathlib import Path
from typing import Any, TypeVar

import draccus
from huggingface_hub import hf_hub_download
from huggingface_hub.constants import CONFIG_NAME
from huggingface_hub.errors import HfHubHTTPError

from lerobot.configs.types import FeatureType, PolicyFeature
from lerobot.optim.optimizers import OptimizerConfig
from lerobot.optim.schedulers import LRSchedulerConfig
from lerobot.utils.constants import ACTION, OBS_STATE
from lerobot.utils.hub import HubMixin
from lerobot.utils.utils import auto_select_torch_device, is_amp_available, is_torch_device_available

T = TypeVar("T", bound="PreTrainedConfig")
logger = getLogger(__name__)


@dataclass
class PreTrainedConfig(draccus.ChoiceRegistry, HubMixin, abc.ABC):  # type: ignore[misc,name-defined] #TODO: draccus issue
    """
    Base configuration class for policy models.

    Args:
        n_obs_steps: Number of environment steps worth of observations to pass to the policy (takes the
            current step and additional steps going back).
        input_shapes: A dictionary defining the shapes of the input data for the policy.
        output_shapes: A dictionary defining the shapes of the output data for the policy.
        input_normalization_modes: A dictionary with key representing the modality and the value specifies the
            normalization mode to apply.
        output_normalization_modes: Similar dictionary as `input_normalization_modes`, but to unnormalize to
            the original scale.
    """

    n_obs_steps: int = 1

    input_features: dict[str, PolicyFeature] = field(default_factory=dict)
    output_features: dict[str, PolicyFeature] = field(default_factory=dict)

    device: str | None = None  # e.g. "cuda", "cuda:0", "cpu", or "mps"
    # `use_amp` determines whether to use Automatic Mixed Precision (AMP) for training and evaluation. With AMP,
    # automatic gradient scaling is used.
    use_amp: bool = False

    push_to_hub: bool = True  # type: ignore[assignment] # TODO: use a different name to avoid override
    repo_id: str | None = None

    # Upload on private repository on the Hugging Face hub.
    private: bool | None = None
    # Add tags to your policy on the hub.
    tags: list[str] | None = None
    # Add tags to your policy on the hub.
    license: str | None = None
    # Either the repo ID of a model hosted on the Hub or a path to a directory containing weights
    # saved using `Policy.save_pretrained`. If not provided, the policy is initialized from scratch.
    pretrained_path: Path | None = None

    # Whether to use Ascend OM model for inference.
    is_ascend_om_enabled: bool = False
    # Path to the Ascend  OM model file.(e.g. /path/to/model.om)
    om_model_path: str = ""

    def __post_init__(self) -> None:
        if not self.device or not is_torch_device_available(self.device):
            auto_device = auto_select_torch_device()
            logger.warning(f"Device '{self.device}' is not available. Switching to '{auto_device}'.")
            self.device = auto_device.type

        # Automatically deactivate AMP if necessary
        if self.use_amp and not is_amp_available(self.device):
            logger.warning(
                f"Automatic Mixed Precision (amp) is not available on device '{self.device}'. Deactivating AMP."
            )
            self.use_amp = False

    @property
    def type(self) -> str:
        choice_name = self.get_choice_name(self.__class__)
        if not isinstance(choice_name, str):
...
```

### src/lerobot/oee/ascend/om/ACTWrapper.py
**状态**: added | **变更**: +41/-0

**Diff**:
```diff
@@ -0,0 +1,41 @@
+"""
+ACTWrapper.py
+
+加载 act om 模型并推理
+"""
+
+import numpy as np
+import torch
+from torch import Tensor
+import OMmodel
+from lerobot.policies.act.configuration_act import ACTConfig
+
+def logger(msg: str):
+    print(f'[ACTWrapper]: {msg}')
+
+class ACTWrapper():
+    def __init__(self, model_path: str, config: ACTConfig):
+        self.om_model = OMmodel(model_path)
+        chunk_size = config.chunk_size
+        action_dim = config.output_features["action"].shape
+        self.output_shape = [1, chunk_size, *action_dim]
+        logger(f"Loaded ACT OM model from {model_path}, output shape: {self.output_shape}")
+
+    def predict(self, batch: dict[str, Tensor]) -> tuple:
+        input_arr = []
+
+        key_to_exclude = [
+            'observation.images', 'action', 'next.reward', 'next.done', 'next.truncated', 'info', 'task'
+        ]
+
+        for key in batch:
+            # TODO: 尝试从 om model descriptor 中获取输入名称
+            if key in key_to_exclude:
+                continue
+            
+            input_arr.append(batch[key].cpu().numpy())
+        
+        output = self.om_model.forward(input_arr)[0]
+
+        o_tensor = torch.from_numpy(np.array(output, dtype=np.float32)).reshape(*self.output_shape)
+        return (o_tensor,)
\ No newline at end of file

```

**文件内容** (预览):
```
"""
ACTWrapper.py

加载 act om 模型并推理
"""

import numpy as np
import torch
from torch import Tensor
import OMmodel
from lerobot.policies.act.configuration_act import ACTConfig

def logger(msg: str):
    print(f'[ACTWrapper]: {msg}')

class ACTWrapper():
    def __init__(self, model_path: str, config: ACTConfig):
        self.om_model = OMmodel(model_path)
        chunk_size = config.chunk_size
        action_dim = config.output_features["action"].shape
        self.output_shape = [1, chunk_size, *action_dim]
        logger(f"Loaded ACT OM model from {model_path}, output shape: {self.output_shape}")

    def predict(self, batch: dict[str, Tensor]) -> tuple:
        input_arr = []

        key_to_exclude = [
            'observation.images', 'action', 'next.reward', 'next.done', 'next.truncated', 'info', 'task'
        ]

        for key in batch:
            # TODO: 尝试从 om model descriptor 中获取输入名称
            if key in key_to_exclude:
                continue
            
            input_arr.append(batch[key].cpu().numpy())
        
        output = self.om_model.forward(input_arr)[0]

        o_tensor = torch.from_numpy(np.array(output, dtype=np.float32)).reshape(*self.output_shape)
        return (o_tensor,)
...
```

### src/lerobot/oee/ascend/om/OMmodel.py
**状态**: added | **变更**: +113/-0

**Diff**:
```diff
@@ -0,0 +1,113 @@
+"""
+OMmodel.py
+
+om 模型的封装调用
+该程序是基于官方文档并做了一点点修改编写的通用 om 加载与推理程序
+与不同 om 模型的不同输入输出格式无关
+"""
+
+import acl
+import numpy as np
+ACL_MEM_MALLOC_HUGE_FIRST = 0
+ACL_MEMCPY_HOST_TO_DEVICE = 1
+ACL_MEMCPY_DEVICE_TO_HOST = 2
+
+def logger(msg: str):
+    print(f'[OM_model]: {msg}')
+
+class OMmodel:
+
+    def __init__(self, model_path):
+        logger(f"model path: {model_path}")
+        self.device_id = 0
+
+        ret = acl.init()
+        self.check_ret(ret, "Failed to init")
+
+        ret = acl.rt.set_device(self.device_id)
+        self.check_ret(ret, "Failed to create device")
+        logger(f"set device id {self.device_id}, ret {ret}")
+        
+        self.model_id, ret = acl.mdl.load_from_file(model_path)
+        self.check_ret(ret, "Failed to load model from file")
+
+        self.model_desc = acl.mdl.create_desc()
+        ret = acl.mdl.get_desc(self.model_desc, self.model_id)
+        self.check_ret(ret, "Failed to get desc")
+        
+        self.input_dataset, self.input_data = self.prepare_dataset('input')
+        self.output_dataset, self.output_data = self.prepare_dataset('output')       
+        
+
+    def forward(self, inputs):
+        input_num = len(inputs)
+        for i in range(input_num):
+            bytes_data = inputs[i].tobytes()
+            bytes_ptr = acl.util.bytes_to_ptr(bytes_data)
+            ret = acl.rt.memcpy(self.input_data[i]["buffer"],  
+                                self.input_data[i]["size"],    
+                                bytes_ptr,                     
+                                len(bytes_data),               
+                                ACL_MEMCPY_HOST_TO_DEVICE)     
+            self.check_ret(ret, "Failed to memcpy from host to device")
+    
+        ret = acl.mdl.execute(self.model_id, self.input_dataset, self.output_dataset)
+        self.check_ret(ret, "Failed to execute forward")
+
+        inference_result = []
+        for i, item in enumerate(self.output_data):
+            buffer_host, ret = acl.rt.malloc_host(self.output_data[i]["size"])
+        
+            ret = acl.rt.memcpy(buffer_host,                   
+                                self.output_data[i]["size"],   
+                                self.output_data[i]["buffer"], 
+                                self.output_data[i]["size"],   
+                                ACL_MEMCPY_DEVICE_TO_HOST)     
+            self.check_ret(ret, "Failed to memcpy from device to host")       
+            bytes_out = acl.util.ptr_to_bytes(buffer_host, self.output_data[i]["size"])
+        
+            data = np.frombuffer(bytes_out, dtype=np.float32)
+            inference_result.append(data)
+        
+            ret = acl.rt.free_host(buffer_host)
+            self.check_ret(ret, "Failed to free host")      
+        
+        return inference_result
+
+    def __del__(self):
+        for dataset in [self.input_data, self.output_data]:
+            while dataset:
+                item = dataset.pop()
+                ret = acl.destroy_data_buffer(item["data"])   
+                ret = acl.rt.free(item["buffer"])             
+        ret = acl.mdl.destroy_dataset(self.input_dataset)     
+        ret = acl.mdl.destroy_dataset(self.output_dataset)    
+        ret = acl.mdl.destroy_desc(self.model_desc)
+        ret = acl.mdl.unload(self.model_id)
+        ret = acl.rt.reset_device(self.device_id)
+        ret = acl.finalize()
+
+    def prepare_dataset(self, io_type):
+        if io_type == "input":       
+            io_num = acl.mdl.get_num_inputs(self.model_desc)
+            acl_mdl_get_size_by_index = acl.mdl.get_input_size_by_index
+        else:
+            io_num = acl.mdl.get_num_outputs(self.model_desc)
+            acl_mdl_get_size_by_index = acl.mdl.get_output_size_by_index
+    
+        dataset = acl.mdl.create_dataset()
+        datas = []
+        for i in range(io_num):
+            buffer_size = acl_mdl_get_size_by_index(self.model_desc, i)
+            buffer, ret = acl.rt.malloc(buffer_size, ACL_MEM_MALLOC_HUGE_FIRST)
+            self.check_ret(ret, "Prepare dataset: Failed to malloc")
+
+            data_buffer = acl.create_data_buffer(buffer, buffer_size)
+            _, ret = acl.mdl.add_dataset_buffer(dataset, data_buffer)
+            self.check_ret(ret, "Prepare dataset: Failed to add dataset buffer")
+            datas.append({"buffer": buffer, "data": data_buffer, "size": buffer_size})
+        return dataset, datas
+
+    def check_ret(self, ret, msg):
+        if ret != 0:
+            raise Exception(f"{msg}, Error code: {ret}")

```

**文件内容** (预览):
```
"""
OMmodel.py

om 模型的封装调用
该程序是基于官方文档并做了一点点修改编写的通用 om 加载与推理程序
与不同 om 模型的不同输入输出格式无关
"""

import acl
import numpy as np
ACL_MEM_MALLOC_HUGE_FIRST = 0
ACL_MEMCPY_HOST_TO_DEVICE = 1
ACL_MEMCPY_DEVICE_TO_HOST = 2

def logger(msg: str):
    print(f'[OM_model]: {msg}')

class OMmodel:

    def __init__(self, model_path):
        logger(f"model path: {model_path}")
        self.device_id = 0

        ret = acl.init()
        self.check_ret(ret, "Failed to init")

        ret = acl.rt.set_device(self.device_id)
        self.check_ret(ret, "Failed to create device")
        logger(f"set device id {self.device_id}, ret {ret}")
        
        self.model_id, ret = acl.mdl.load_from_file(model_path)
        self.check_ret(ret, "Failed to load model from file")

        self.model_desc = acl.mdl.create_desc()
        ret = acl.mdl.get_desc(self.model_desc, self.model_id)
        self.check_ret(ret, "Failed to get desc")
        
        self.input_dataset, self.input_data = self.prepare_dataset('input')
        self.output_dataset, self.output_data = self.prepare_dataset('output')       
        

    def forward(self, inputs):
        input_num = len(inputs)
        for i in range(input_num):
            bytes_data = inputs[i].tobytes()
            bytes_ptr = acl.util.bytes_to_ptr(bytes_data)
            ret = acl.rt.memcpy(self.input_data[i]["buffer"],  
                                self.input_data[i]["size"],    
                                bytes_ptr,                     
                                len(bytes_data),               
                                ACL_MEMCPY_HOST_TO_DEVICE)     
            self.check_ret(ret, "Failed to memcpy from host to device")
    
        ret = acl.mdl.execute(self.model_id, self.input_dataset, self.output_dataset)
        self.check_ret(ret, "Failed to execute forward")

        inference_result = []
        for i, item in enumerate(self.output_data):
            buffer_host, ret = acl.rt.malloc_host(self.output_data[i]["size"])
        
            ret = acl.rt.memcpy(buffer_host,                   
                                self.output_data[i]["size"],   
                                self.output_data[i]["buffer"], 
                                self.output_data[i]["size"],   
                                ACL_MEMCPY_DEVICE_TO_HOST)     
            self.check_ret(ret, "Failed to memcpy from device to host")       
            bytes_out = acl.util.ptr_to_bytes(buffer_host, self.output_data[i]["size"])
        
            data = np.frombuffer(bytes_out, dtype=np.float32)
            inference_result.append(data)
        
            ret = acl.rt.free_host(buffer_host)
            self.check_ret(ret, "Failed to free host")      
        
        return inference_result

    def __del__(self):
        for dataset in [self.input_data, self.output_data]:
            while dataset:
                item = dataset.pop()
                ret = acl.destroy_data_buffer(item["data"])   
                ret = acl.rt.free(item["buffer"])             
        ret = acl.mdl.destroy_dataset(self.input_dataset)     
        ret = acl.mdl.destroy_dataset(self.output_dataset)    
        ret = acl.mdl.destroy_desc(self.model_desc)
        ret = acl.mdl.unload(self.model_id)
        ret = acl.rt.reset_device(self.device_id)
        ret = acl.finalize()

    def prepare_dataset(self, io_type):
        if io_type == "input":       
            io_num = acl.mdl.get_num_inputs(self.model_desc)
            acl_mdl_get_size_by_index = acl.mdl.get_input_size_by_index
        else:
            io_num = acl.mdl.get_num_outputs(self.model_desc)
            acl_mdl_get_size_by_index = acl.mdl.get_output_size_by_index
    
        dataset = acl.mdl.create_dataset()
        datas = []
        for i in range(io_num):
...
```

### src/lerobot/policies/act/modeling_act.py
**状态**: undefined | **变更**: +28/-7

**Diff**:
```diff
@@ -87,7 +87,17 @@ class ACTPolicy(PreTrainedPolicy):
         self._is_first_action_of_episode = True
         self.gui_save_dir = "gui_interactions"
 
-        self.model = ACT(config)
+        if self.config.is_ascend_om_enabled:
+            print(f"[INFO] Ascend om enabled, training and visualization are not allowed")
+            self.enable_interactive_masking = False
+            self.enable_visualization = False
+            from lerobot.oee.ascend.om.ACTWrapper import ACTWrapper
+            # use precompiled kernels to speed up warm up phase
+            self.om_model = ACTWrapper(self.config.om_model_path, self.config)
+            torch.npu.set_compile_mode(jit_compile=False)
+        else:
+            # only init original act model here to speed up warm up phase in om mode
+            self.model = ACT(config)
 
         if config.temporal_ensemble_coeff is not None:
             self.temporal_ensembler = ACTTemporalEnsembler(config.temporal_ensemble_coeff, config.chunk_size)
@@ -174,12 +184,20 @@ class ACTPolicy(PreTrainedPolicy):
             self._action_queue.extend(actions.transpose(0, 1))
         return self._action_queue.popleft()
 
+    @classmethod
+    def is_next_pred_need_obs(cls) -> bool:
+        """Return whether the next select_action needs new observations.
+
+        For ACT, as long as there are actions in the action queue, new observations are not needed.
+        """
+        return len(cls._action_queue) == 0 if hasattr(cls, '_action_queue') else True
+
     @torch.no_grad()
     def predict_action_chunk(self, batch: dict[str, Tensor]) -> Tensor:
         self.eval()
         self.inference_step_counter += 1
 
-        if self.feature_map_size is None and self.config.image_features:
+        if (self.enable_visualization or self.enable_interactive_masking) and self.feature_map_size is None and self.config.image_features:
             first_cam_key = list(self.config.image_features.keys())[0]
 
             # 使用已经归一化过的batch输入到backbone
@@ -230,11 +248,14 @@ class ACTPolicy(PreTrainedPolicy):
             batch = dict(batch)  # shallow copy so that adding a key doesn't modify the original
             batch[OBS_IMAGES] = [batch[key] for key in self.config.image_features]
 
-        actions, _, attn_weights = self.model(
-            batch,
-            attention_mask=final_attention_mask,
-            encoder_key_padding_mask=final_encoder_key_padding_mask
-        )
+        if self.config.is_ascend_om_enabled:
+            actions = self.om_model.predict(batch)[0]
+        else:
+            actions, _, attn_weights, _ = self.model(
+                batch,
+                attention_mask=final_attention_mask,
+                encoder_key_padding_mask=final_encoder_key_padding_mask  # <-- 传入新掩码
+            )
 
         should_visualize = (
                 self.enable_visualization and self.config.image_features and attn_weights is not None and

```

**文件内容** (预览):
```
#!/usr/bin/env python

# Copyright 2024 Tony Z. Zhao and The HuggingFace Inc. team. All rights reserved.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
"""Action Chunking Transformer Policy

As per Learning Fine-Grained Bimanual Manipulation with Low-Cost Hardware (https://huggingface.co/papers/2304.13705).
The majority of changes here involve removing unused code, unifying naming, and adding helpful comments.
"""

import math
from collections import deque
from collections.abc import Callable
from itertools import chain

import einops
import numpy as np
import torch
import torch.nn.functional as F  # noqa: N812
import torchvision
from torch import Tensor, nn
from torchvision.models._utils import IntermediateLayerGetter
from torchvision.ops.misc import FrozenBatchNorm2d

from lerobot.policies.act.configuration_act import ACTConfig
from lerobot.policies.pretrained import PreTrainedPolicy
from lerobot.utils.constants import ACTION, OBS_ENV_STATE, OBS_IMAGES, OBS_STATE

import cv2
import os
from typing import Optional

from lerobot.utils.attention_masking import (
    create_interactive_masks,
    process_pixel_mask_to_feature_mask
)
from lerobot.utils.visualization import RealTimeVisualizer, visualize_attention_maps

class ACTPolicy(PreTrainedPolicy):
    """
    Action Chunking Transformer Policy as per Learning Fine-Grained Bimanual Manipulation with Low-Cost
    Hardware (paper: https://huggingface.co/papers/2304.13705, code: https://github.com/tonyzhaozh/act)
    """

    config_class = ACTConfig
    name = "act"

    def __init__(
        self,
        config: ACTConfig,
    ):
        """
        Args:
            config: Policy configuration class instance or None, in which case the default instantiation of
                    the configuration class is used.
        """
        super().__init__(config)
        config.validate_features()
        self.config = config

        # 可视化和交互掩码相关的参数
        self.inference_step_counter = 0
        # --- 可视化相关参数 ---
        self.enable_visualization = False
        self.visualization_frequency = 10
        self.visualization_dir = "inference_visualizations"
        self.action_queries_to_visualize = list(range(0, 100, 20))
        self.viz_layer_idx = -1
        self.viz_batch_idx = 0
        self.viz_average_heads = True
        self.viz_blend_alpha = 0.4

        # --- 掩码与交互相关参数 ---
        self.enable_interactive_masking = False
        self.user_attention_masks = {}
        self._is_first_action_of_episode = True
        self.gui_save_dir = "gui_interactions"

        if self.config.is_ascend_om_enabled:
            print(f"[INFO] Ascend om enabled, training and visualization are not allowed")
            self.enable_interactive_masking = False
            self.enable_visualization = False
            from lerobot.oee.ascend.om.ACTWrapper import ACTWrapper
            # use precompiled kernels to speed up warm up phase
            self.om_model = ACTWrapper(self.config.om_model_path, self.config)
            torch.npu.set_compile_mode(jit_compile=False)
        else:
            # only init original act model here to speed up warm up phase in om mode
            self.model = ACT(config)
...
```

### src/lerobot/policies/pretrained.py
**状态**: undefined | **变更**: +9/-0

**Diff**:
```diff
@@ -202,6 +202,15 @@ class PreTrainedPolicy(nn.Module, HubMixin, abc.ABC):
         with caching.
         """
         raise NotImplementedError
+    
+    @classmethod
+    def is_next_pred_need_obs(cls) -> bool:
+        """Return whether the next action prediction needs new observations.
+
+        For action chunking policies, this is True when the action chunk cache is empty.
+        So that new observations are needed for predicting the next action chunk.
+        """
+        return True
 
     def push_model_to_hub(
         self,

```

**文件内容** (预览):
```
# Copyright 2024 The HuggingFace Inc. team. All rights reserved.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
import abc
import builtins
import logging
import os
from importlib.resources import files
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import TypedDict, TypeVar

import packaging
import safetensors
from huggingface_hub import HfApi, ModelCard, ModelCardData, hf_hub_download
from huggingface_hub.constants import SAFETENSORS_SINGLE_FILE
from huggingface_hub.errors import HfHubHTTPError
from safetensors.torch import load_model as load_model_as_safetensor, save_model as save_model_as_safetensor
from torch import Tensor, nn
from typing_extensions import Unpack

from lerobot.configs.policies import PreTrainedConfig
from lerobot.configs.train import TrainPipelineConfig
from lerobot.policies.utils import log_model_loading_keys
from lerobot.utils.hub import HubMixin

T = TypeVar("T", bound="PreTrainedPolicy")


class ActionSelectKwargs(TypedDict, total=False):
    noise: Tensor | None


class PreTrainedPolicy(nn.Module, HubMixin, abc.ABC):
    """
    Base class for policy models.
    """

    config_class: None
    name: None

    def __init__(self, config: PreTrainedConfig, *inputs, **kwargs):
        super().__init__()
        if not isinstance(config, PreTrainedConfig):
            raise ValueError(
                f"Parameter config in `{self.__class__.__name__}(config)` should be an instance of class "
                "`PreTrainedConfig`. To create a model from a pretrained model use "
                f"`model = {self.__class__.__name__}.from_pretrained(PRETRAINED_MODEL_NAME)`"
            )
        self.config = config

    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        if not getattr(cls, "config_class", None):
            raise TypeError(f"Class {cls.__name__} must define 'config_class'")
        if not getattr(cls, "name", None):
            raise TypeError(f"Class {cls.__name__} must define 'name'")

    def _save_pretrained(self, save_directory: Path) -> None:
        self.config._save_pretrained(save_directory)
        model_to_save = self.module if hasattr(self, "module") else self
        save_model_as_safetensor(model_to_save, str(save_directory / SAFETENSORS_SINGLE_FILE))

    @classmethod
    def from_pretrained(
        cls: builtins.type[T],
        pretrained_name_or_path: str | Path,
        *,
        config: PreTrainedConfig | None = None,
        force_download: bool = False,
        resume_download: bool | None = None,
        proxies: dict | None = None,
        token: str | bool | None = None,
        cache_dir: str | Path | None = None,
        local_files_only: bool = False,
        revision: str | None = None,
        strict: bool = False,
        **kwargs,
    ) -> T:
        """
        The policy is set in evaluation mode by default using `policy.eval()` (dropout modules are
        deactivated). To train it, you should first set it back in training mode with `policy.train()`.
        """
        if config is None:
            config = PreTrainedConfig.from_pretrained(
                pretrained_name_or_path=pretrained_name_or_path,
                force_download=force_download,
                resume_download=resume_download,
                proxies=proxies,
                token=token,
...
```

### src/lerobot/utils/utils.py
**状态**: undefined | **变更**: +11/-3

**Diff**:
```diff
@@ -39,9 +39,12 @@ def inside_slurm():
 
 def auto_select_torch_device() -> torch.device:
     """Tries to select automatically a torch device."""
-    if torch.cuda.is_available():
-        logging.info("Cuda backend detected, using cuda.")
+    if getattr(torch, "cuda", None) and torch.cuda.is_available():
+        logging.info("cuda backend detected, using cuda.")
         return torch.device("cuda")
+    if getattr(torch, "npu", None) and torch.npu.is_available():
+        logging.info("npu backend detected, using npu.")
+        return torch.device("npu")
     elif torch.backends.mps.is_available():
         logging.info("Metal backend detected, using mps.")
         return torch.device("mps")
@@ -60,6 +63,9 @@ def get_safe_torch_device(try_device: str, log: bool = False) -> torch.device:
     if try_device.startswith("cuda"):
         assert torch.cuda.is_available()
         device = torch.device(try_device)
+    elif try_device.startswith("npu"):
+        assert torch.npu.is_available()
+        device = torch.device(try_device)
     elif try_device == "mps":
         assert torch.backends.mps.is_available()
         device = torch.device("mps")
@@ -107,7 +113,9 @@ def get_safe_dtype(dtype: torch.dtype, device: str | torch.device):
 def is_torch_device_available(try_device: str) -> bool:
     try_device = str(try_device)  # Ensure try_device is a string
     if try_device.startswith("cuda"):
-        return torch.cuda.is_available()
+        return getattr(torch, "cuda", None) and torch.cuda.is_available()
+    elif try_device.startswith("npu"):
+        return getattr(torch, "npu", None) and torch.npu.is_available()
     elif try_device == "mps":
         return torch.backends.mps.is_available()
     elif try_device == "xpu":

```

**文件内容** (预览):
```
#!/usr/bin/env python

# Copyright 2024 The HuggingFace Inc. team. All rights reserved.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
import logging
import os
import platform
import select
import subprocess
import sys
import time
from copy import copy, deepcopy
from datetime import datetime
from pathlib import Path
from statistics import mean

import numpy as np
import torch
from accelerate import Accelerator
from datasets.utils.logging import disable_progress_bar, enable_progress_bar


def inside_slurm():
    """Check whether the python process was launched through slurm"""
    # TODO(rcadene): return False for interactive mode `--pty bash`
    return "SLURM_JOB_ID" in os.environ


def auto_select_torch_device() -> torch.device:
    """Tries to select automatically a torch device."""
    if getattr(torch, "cuda", None) and torch.cuda.is_available():
        logging.info("cuda backend detected, using cuda.")
        return torch.device("cuda")
    if getattr(torch, "npu", None) and torch.npu.is_available():
        logging.info("npu backend detected, using npu.")
        return torch.device("npu")
    elif torch.backends.mps.is_available():
        logging.info("Metal backend detected, using mps.")
        return torch.device("mps")
    elif torch.xpu.is_available():
        logging.info("Intel XPU backend detected, using xpu.")
        return torch.device("xpu")
    else:
        logging.warning("No accelerated backend detected. Using default cpu, this will be slow.")
        return torch.device("cpu")


# TODO(Steven): Remove log. log shouldn't be an argument, this should be handled by the logger level
def get_safe_torch_device(try_device: str, log: bool = False) -> torch.device:
    """Given a string, return a torch.device with checks on whether the device is available."""
    try_device = str(try_device)
    if try_device.startswith("cuda"):
        assert torch.cuda.is_available()
        device = torch.device(try_device)
    elif try_device.startswith("npu"):
        assert torch.npu.is_available()
        device = torch.device(try_device)
    elif try_device == "mps":
        assert torch.backends.mps.is_available()
        device = torch.device("mps")
    elif try_device == "xpu":
        assert torch.xpu.is_available()
        device = torch.device("xpu")
    elif try_device == "cpu":
        device = torch.device("cpu")
        if log:
            logging.warning("Using CPU, this will be slow.")
    else:
        device = torch.device(try_device)
        if log:
            logging.warning(f"Using custom {try_device} device.")
    return device


def get_safe_dtype(dtype: torch.dtype, device: str | torch.device):
    """
    mps is currently not compatible with float64
    """
    if isinstance(device, torch.device):
        device = device.type
    if device == "mps" and dtype == torch.float64:
        return torch.float32
    if device == "xpu" and dtype == torch.float64:
        if hasattr(torch.xpu, "get_device_capability"):
            device_capability = torch.xpu.get_device_capability()
            # NOTE: Some Intel XPU devices do not support double precision (FP64).
            # The `has_fp64` flag is returned by `torch.xpu.get_device_capability()`
            # when available; if False, we fall back to float32 for compatibility.
            if not device_capability.get("has_fp64", False):
...
```

### src/ros2_ws/src/hardware_control_py/hardware_control_py/__init__.py
**状态**: added | **变更**: +0/-0

**Diff**:
```diff
The file is empty
```

### src/ros2_ws/src/hardware_control_py/hardware_control_py/get_camera.py
**状态**: added | **变更**: +100/-0

**Diff**:
```diff
@@ -0,0 +1,100 @@
+# !/usr/bin/env python3
+# -*- coding: utf-8 -*-
+# @Time    : 2025/07/21 16:00
+# @Author  : Yida Hao
+# @File    : get_camera.py
+
+from time import sleep
+from rclpy.node import Node
+from sensor_msgs.msg import Image
+from interfaces.msg import CamImages
+from interfaces.srv import GetImage
+
+# TODO: 从 workspace 公共目录引入
+CAMERA_PREFIX = "/camera/"
+
+SRV_NAME = 'get_camera_service'
+
+"""
+Service to get camera images from the robot.
+"""
+
+
+class GetCameraService(Node):
+    def __init__(self):
+        super().__init__(f'{SRV_NAME}_srv')
+
+        # Discover camera topics dynamically
+        self.discover_camera_topics()
+
+        self.current_camera_images = [Image() for _ in self.cam_names]
+
+        self.init_camera_subscribers()
+
+        while not all(self.current_camera_images):
+            self.get_logger().info("waiting for connection to robot")
+            sleep(1)
+
+        self.srv = self.create_service(GetImage, SRV_NAME, self.srv_callback)
+
+        self.get_logger().info("service ready")
+    
+    def discover_camera_topics(self):
+        """Discover all topics with CAMERA_PREFIX"""
+        self.get_logger().info(f"Discovering camera topics with prefix: {CAMERA_PREFIX}")
+        
+        # Wait a bit for publishers to be ready
+        sleep(1)
+        
+        # Get all topics
+        topic_names_and_types = self.get_topic_names_and_types()
+        
+        # Filter topics with CAMERA_PREFIX and Image type
+        self.cam_names = []
+        for topic_name, topic_types in topic_names_and_types:
+            if topic_name.startswith(CAMERA_PREFIX) and 'sensor_msgs/msg/Image' in topic_types:
+                # Extract camera name by removing prefix
+                camera_name = topic_name[len(CAMERA_PREFIX):]
+                self.cam_names.append(camera_name)
+                self.get_logger().info(f"Found camera topic: {topic_name} -> {camera_name}")
+        
+        if not self.cam_names:
+            self.get_logger().warn(f"No camera topics found with prefix {CAMERA_PREFIX}, waiting...")
+            sleep(1)
+            self.discover_camera_topics()  # Retry
+    
+    def srv_callback(self, request, response):
+        self.get_logger().info("service called")
+        response.cam_images.name = self.cam_names
+        response.cam_images.image = self.current_camera_images
+        return response
+
+    def init_camera_subscribers(self):
+        self.camera_subscribers = []
+        for i, camera_name in enumerate(self.cam_names):
+            topic_name = CAMERA_PREFIX + camera_name
+            sub = self.create_subscription(
+                Image,
+                topic_name,
+                lambda msg, idx=i: self.update_camera_image(idx, msg),
+                10
+            )
+            self.camera_subscribers.append(sub)
+            self.get_logger().info(f"Subscribed to {topic_name}")
+    
+    def update_camera_image(self, camera_index: int, msg: Image):
+        self.current_camera_images[camera_index] = msg
+
+class GetCameraClient(Node):
+    def __init__(self):
+        super().__init__(f'{SRV_NAME}_cli')
+        self.cli = self.create_client(GetImage, SRV_NAME)
+
+        while not self.cli.wait_for_service(timeout_sec=1.0):
+            self.get_logger().info('service not available, waiting ...')
+
+        self.req = GetImage.Request()
+
+    def send_request(self):
+        future = self.cli.call_async(self.req)
+        return future

```

**文件内容** (预览):
```
# !/usr/bin/env python3
# -*- coding: utf-8 -*-
# @Time    : 2025/07/21 16:00
# @Author  : Yida Hao
# @File    : get_camera.py

from time import sleep
from rclpy.node import Node
from sensor_msgs.msg import Image
from interfaces.msg import CamImages
from interfaces.srv import GetImage

# TODO: 从 workspace 公共目录引入
CAMERA_PREFIX = "/camera/"

SRV_NAME = 'get_camera_service'

"""
Service to get camera images from the robot.
"""


class GetCameraService(Node):
    def __init__(self):
        super().__init__(f'{SRV_NAME}_srv')

        # Discover camera topics dynamically
        self.discover_camera_topics()

        self.current_camera_images = [Image() for _ in self.cam_names]

        self.init_camera_subscribers()

        while not all(self.current_camera_images):
            self.get_logger().info("waiting for connection to robot")
            sleep(1)

        self.srv = self.create_service(GetImage, SRV_NAME, self.srv_callback)

        self.get_logger().info("service ready")
    
    def discover_camera_topics(self):
        """Discover all topics with CAMERA_PREFIX"""
        self.get_logger().info(f"Discovering camera topics with prefix: {CAMERA_PREFIX}")
        
        # Wait a bit for publishers to be ready
        sleep(1)
        
        # Get all topics
        topic_names_and_types = self.get_topic_names_and_types()
        
        # Filter topics with CAMERA_PREFIX and Image type
        self.cam_names = []
        for topic_name, topic_types in topic_names_and_types:
            if topic_name.startswith(CAMERA_PREFIX) and 'sensor_msgs/msg/Image' in topic_types:
                # Extract camera name by removing prefix
                camera_name = topic_name[len(CAMERA_PREFIX):]
                self.cam_names.append(camera_name)
                self.get_logger().info(f"Found camera topic: {topic_name} -> {camera_name}")
        
        if not self.cam_names:
            self.get_logger().warn(f"No camera topics found with prefix {CAMERA_PREFIX}, waiting...")
            sleep(1)
            self.discover_camera_topics()  # Retry
    
    def srv_callback(self, request, response):
        self.get_logger().info("service called")
        response.cam_images.name = self.cam_names
        response.cam_images.image = self.current_camera_images
        return response

    def init_camera_subscribers(self):
        self.camera_subscribers = []
        for i, camera_name in enumerate(self.cam_names):
            topic_name = CAMERA_PREFIX + camera_name
            sub = self.create_subscription(
                Image,
                topic_name,
                lambda msg, idx=i: self.update_camera_image(idx, msg),
                10
            )
            self.camera_subscribers.append(sub)
            self.get_logger().info(f"Subscribed to {topic_name}")
    
    def update_camera_image(self, camera_index: int, msg: Image):
        self.current_camera_images[camera_index] = msg

class GetCameraClient(Node):
    def __init__(self):
        super().__init__(f'{SRV_NAME}_cli')
        self.cli = self.create_client(GetImage, SRV_NAME)

        while not self.cli.wait_for_service(timeout_sec=1.0):
            self.get_logger().info('service not available, waiting ...')

        self.req = GetImage.Request()

    def send_request(self):
        future = self.cli.call_async(self.req)
        return future
...
```

### src/ros2_ws/src/hardware_control_py/hardware_control_py/get_joint_states.py
**状态**: added | **变更**: +60/-0

**Diff**:
```diff
@@ -0,0 +1,60 @@
+# !/usr/bin/env python3
+# -*- coding: utf-8 -*-
+# @Time    : 2025/07/21 16:00
+# @Author  : Yida Hao
+# @File    : get_joint_states.py
+
+from rclpy.node import Node
+from sensor_msgs.msg import JointState
+from interfaces.srv import GetJointStates
+from typing import Optional
+
+SRV_NAME = 'get_joint_state_service'
+
+"""
+Service to get joint states from the robot.
+"""
+
+class GetJointStateService(Node):
+    def __init__(self):
+        super().__init__(f'{SRV_NAME}_srv')
+
+        self.init_joint_state_sub()
+
+        self.current_joint_state = JointState()
+
+        self.srv = self.create_service(GetJointStates, SRV_NAME, self.srv_callback)
+
+        self.get_logger().info("service ready")
+
+    def srv_callback(self, request, response):
+        response.joint_state = self.current_joint_state
+        self.get_logger().info(f'service called, got joint position: {response.joint_state.position}')
+        return response
+        
+    def init_joint_state_sub(self):
+        self.joint_state_subscriber = self.create_subscription(
+            JointState,
+            'joint_states',
+            self.joint_state_callback,
+            10
+        )
+
+    def joint_state_callback(self, msg: JointState):
+        self.current_joint_state = msg  
+
+
+class GetJointStateClient(Node):
+    def __init__(self):
+        super().__init__(f'{SRV_NAME}_cli')
+        self.cli = self.create_client(GetJointStates, SRV_NAME)
+
+        while not self.cli.wait_for_service(timeout_sec=1.0):
+            self.get_logger().info('service not available, waiting ...')
+
+        self.req = GetJointStates.Request()
+
+    def send_request(self):
+        future = self.cli.call_async(self.req)
+        return future
+

```

**文件内容** (预览):
```
# !/usr/bin/env python3
# -*- coding: utf-8 -*-
# @Time    : 2025/07/21 16:00
# @Author  : Yida Hao
# @File    : get_joint_states.py

from rclpy.node import Node
from sensor_msgs.msg import JointState
from interfaces.srv import GetJointStates
from typing import Optional

SRV_NAME = 'get_joint_state_service'

"""
Service to get joint states from the robot.
"""

class GetJointStateService(Node):
    def __init__(self):
        super().__init__(f'{SRV_NAME}_srv')

        self.init_joint_state_sub()

        self.current_joint_state = JointState()

        self.srv = self.create_service(GetJointStates, SRV_NAME, self.srv_callback)

        self.get_logger().info("service ready")

    def srv_callback(self, request, response):
        response.joint_state = self.current_joint_state
        self.get_logger().info(f'service called, got joint position: {response.joint_state.position}')
        return response
        
    def init_joint_state_sub(self):
        self.joint_state_subscriber = self.create_subscription(
            JointState,
            'joint_states',
            self.joint_state_callback,
            10
        )

    def joint_state_callback(self, msg: JointState):
        self.current_joint_state = msg  


class GetJointStateClient(Node):
    def __init__(self):
        super().__init__(f'{SRV_NAME}_cli')
        self.cli = self.create_client(GetJointStates, SRV_NAME)

        while not self.cli.wait_for_service(timeout_sec=1.0):
            self.get_logger().info('service not available, waiting ...')

        self.req = GetJointStates.Request()

    def send_request(self):
        future = self.cli.call_async(self.req)
        return future


...
```

### src/ros2_ws/src/hardware_control_py/hardware_control_py/main.py
**状态**: added | **变更**: +36/-0

**Diff**:
```diff
@@ -0,0 +1,36 @@
+# !/usr/bin/env python3
+# -*- coding: utf-8 -*-
+# @Time    : 2025/07/21 16:00
+# @Author  : Yida Hao
+# @File    : main.py
+
+import rclpy
+from rclpy.executors import MultiThreadedExecutor
+from hardware_control_py.get_joint_states import GetJointStateService
+from hardware_control_py.get_camera import GetCameraService
+from hardware_control_py.set_joint_cmd import SetJointCommandService
+
+"""
+Main entry point for the hardware control module.
+Launches all related service nodes
+"""
+
+def main(args=None):
+    rclpy.init(args=args)
+
+    joint_state_service = GetJointStateService()
+    camera_service = GetCameraService()
+    joint_command_service = SetJointCommandService()
+    
+    executor = MultiThreadedExecutor()
+    executor.add_node(joint_state_service)
+    executor.add_node(camera_service)
+    executor.add_node(joint_command_service)
+
+    executor.spin()
+
+    joint_state_service.destroy_node()
+    camera_service.destroy_node()
+    joint_command_service.destroy_node()
+
+    rclpy.shutdown()

```

**文件内容** (预览):
```
# !/usr/bin/env python3
# -*- coding: utf-8 -*-
# @Time    : 2025/07/21 16:00
# @Author  : Yida Hao
# @File    : main.py

import rclpy
from rclpy.executors import MultiThreadedExecutor
from hardware_control_py.get_joint_states import GetJointStateService
from hardware_control_py.get_camera import GetCameraService
from hardware_control_py.set_joint_cmd import SetJointCommandService

"""
Main entry point for the hardware control module.
Launches all related service nodes
"""

def main(args=None):
    rclpy.init(args=args)

    joint_state_service = GetJointStateService()
    camera_service = GetCameraService()
    joint_command_service = SetJointCommandService()
    
    executor = MultiThreadedExecutor()
    executor.add_node(joint_state_service)
    executor.add_node(camera_service)
    executor.add_node(joint_command_service)

    executor.spin()

    joint_state_service.destroy_node()
    camera_service.destroy_node()
    joint_command_service.destroy_node()

    rclpy.shutdown()

...
```

### src/ros2_ws/src/hardware_control_py/hardware_control_py/set_joint_cmd.py
**状态**: added | **变更**: +49/-0

**Diff**:
```diff
@@ -0,0 +1,49 @@
+# !/usr/bin/env python3
+# -*- coding: utf-8 -*-
+# @Time    : 2025/07/22 14:00
+# @Author  : Yida Hao
+# @File    : set_joint_cmd.py
+
+from rclpy.node import Node
+from interfaces.srv import SetJointCommand
+from sensor_msgs.msg import JointState
+
+topic_name = 'joint_commands'
+
+SRV_NAME = 'set_joint_command_service'
+
+"""
+Service to set joint commands for the robot.
+"""
+
+class SetJointCommandService(Node):
+    def __init__(self):
+        super().__init__(f'{SRV_NAME}_srv')
+        self.init_joint_command_publisher()
+        self.srv = self.create_service(SetJointCommand, SRV_NAME, self.srv_callback)
+        self.get_logger().info("service ready")
+
+    def init_joint_command_publisher(self):
+        self.pub = self.create_publisher(JointState, topic_name, 10)
+
+    def srv_callback(self, request, response):
+        self.pub.publish(request.joint_command)
+        self.get_logger().info(f"service called, publish position: {request.joint_command.position}")
+    
+        return response
+
+class SetJointCommandClient(Node):
+    def __init__(self):
+        super().__init__(f'{SRV_NAME}_cli')
+        self.cli = self.create_client(SetJointCommand, SRV_NAME)
+
+        while not self.cli.wait_for_service(timeout_sec=1.0):
+            self.get_logger().info('service not available, waiting ...')
+
+        self.req = SetJointCommand.Request()
+
+    def send_request(self, command):
+        if command is not None:
+            self.req.joint_command = command
+        future = self.cli.call_async(self.req)
+        return future
\ No newline at end of file

```

**文件内容** (预览):
```
# !/usr/bin/env python3
# -*- coding: utf-8 -*-
# @Time    : 2025/07/22 14:00
# @Author  : Yida Hao
# @File    : set_joint_cmd.py

from rclpy.node import Node
from interfaces.srv import SetJointCommand
from sensor_msgs.msg import JointState

topic_name = 'joint_commands'

SRV_NAME = 'set_joint_command_service'

"""
Service to set joint commands for the robot.
"""

class SetJointCommandService(Node):
    def __init__(self):
        super().__init__(f'{SRV_NAME}_srv')
        self.init_joint_command_publisher()
        self.srv = self.create_service(SetJointCommand, SRV_NAME, self.srv_callback)
        self.get_logger().info("service ready")

    def init_joint_command_publisher(self):
        self.pub = self.create_publisher(JointState, topic_name, 10)

    def srv_callback(self, request, response):
        self.pub.publish(request.joint_command)
        self.get_logger().info(f"service called, publish position: {request.joint_command.position}")
    
        return response

class SetJointCommandClient(Node):
    def __init__(self):
        super().__init__(f'{SRV_NAME}_cli')
        self.cli = self.create_client(SetJointCommand, SRV_NAME)

        while not self.cli.wait_for_service(timeout_sec=1.0):
            self.get_logger().info('service not available, waiting ...')

        self.req = SetJointCommand.Request()

    def send_request(self, command):
        if command is not None:
            self.req.joint_command = command
        future = self.cli.call_async(self.req)
        return future
...
```

### src/ros2_ws/src/hardware_control_py/resource/hardware_control_py
**状态**: added | **变更**: +0/-0

**Diff**:
```diff
The file is empty
```

### src/ros2_ws/src/hardware_control_py/setup.cfg
**状态**: added | **变更**: +4/-0

**Diff**:
```diff
@@ -0,0 +1,4 @@
+[develop]
+script_dir=$base/lib/hardware_control_py
+[install]
+install_scripts=$base/lib/hardware_control_py

```

**文件内容** (预览):
```
[develop]
script_dir=$base/lib/hardware_control_py
[install]
install_scripts=$base/lib/hardware_control_py

...
```

### src/ros2_ws/src/hardware_control_py/setup.py
**状态**: added | **变更**: +26/-0

**Diff**:
```diff
@@ -0,0 +1,26 @@
+from setuptools import find_packages, setup
+
+package_name = 'hardware_control_py'
+
+setup(
+    name=package_name,
+    version='0.0.0',
+    packages=find_packages(exclude=['test']),
+    data_files=[
+        ('share/ament_index/resource_index/packages',
+            ['resource/' + package_name]),
+        ('share/' + package_name, ['package.xml']),
+    ],
+    install_requires=['setuptools'],
+    zip_safe=True,
+    maintainer='ch3cooh',
+    maintainer_email='haoyida542@gmail.com',
+    description='TODO: Package description',
+    license='TODO: License declaration',
+    tests_require=['pytest'],
+    entry_points={
+        'console_scripts': [
+            'launch = hardware_control_py.main:main',
+        ],
+    },
+)

```

**文件内容** (预览):
```
from setuptools import find_packages, setup

package_name = 'hardware_control_py'

setup(
    name=package_name,
    version='0.0.0',
    packages=find_packages(exclude=['test']),
    data_files=[
        ('share/ament_index/resource_index/packages',
            ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='ch3cooh',
    maintainer_email='haoyida542@gmail.com',
    description='TODO: Package description',
    license='TODO: License declaration',
    tests_require=['pytest'],
    entry_points={
        'console_scripts': [
            'launch = hardware_control_py.main:main',
        ],
    },
)

...
```

### src/ros2_ws/src/hardware_control_py/test/test_copyright.py
**状态**: added | **变更**: +25/-0

**Diff**:
```diff
@@ -0,0 +1,25 @@
+# Copyright 2015 Open Source Robotics Foundation, Inc.
+#
+# Licensed under the Apache License, Version 2.0 (the "License");
+# you may not use this file except in compliance with the License.
+# You may obtain a copy of the License at
+#
+#     http://www.apache.org/licenses/LICENSE-2.0
+#
+# Unless required by applicable law or agreed to in writing, software
+# distributed under the License is distributed on an "AS IS" BASIS,
+# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
+# See the License for the specific language governing permissions and
+# limitations under the License.
+
+from ament_copyright.main import main
+import pytest
+
+
+# Remove the `skip` decorator once the source file(s) have a copyright header
+@pytest.mark.skip(reason='No copyright header has been placed in the generated source file.')
+@pytest.mark.copyright
+@pytest.mark.linter
+def test_copyright():
+    rc = main(argv=['.', 'test'])
+    assert rc == 0, 'Found errors'

```

**文件内容** (预览):
```
# Copyright 2015 Open Source Robotics Foundation, Inc.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

from ament_copyright.main import main
import pytest


# Remove the `skip` decorator once the source file(s) have a copyright header
@pytest.mark.skip(reason='No copyright header has been placed in the generated source file.')
@pytest.mark.copyright
@pytest.mark.linter
def test_copyright():
    rc = main(argv=['.', 'test'])
    assert rc == 0, 'Found errors'

...
```

### src/ros2_ws/src/hardware_control_py/test/test_flake8.py
**状态**: added | **变更**: +25/-0

**Diff**:
```diff
@@ -0,0 +1,25 @@
+# Copyright 2017 Open Source Robotics Foundation, Inc.
+#
+# Licensed under the Apache License, Version 2.0 (the "License");
+# you may not use this file except in compliance with the License.
+# You may obtain a copy of the License at
+#
+#     http://www.apache.org/licenses/LICENSE-2.0
+#
+# Unless required by applicable law or agreed to in writing, software
+# distributed under the License is distributed on an "AS IS" BASIS,
+# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
+# See the License for the specific language governing permissions and
+# limitations under the License.
+
+from ament_flake8.main import main_with_errors
+import pytest
+
+
+@pytest.mark.flake8
+@pytest.mark.linter
+def test_flake8():
+    rc, errors = main_with_errors(argv=[])
+    assert rc == 0, \
+        'Found %d code style errors / warnings:\n' % len(errors) + \
+        '\n'.join(errors)

```

**文件内容** (预览):
```
# Copyright 2017 Open Source Robotics Foundation, Inc.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

from ament_flake8.main import main_with_errors
import pytest


@pytest.mark.flake8
@pytest.mark.linter
def test_flake8():
    rc, errors = main_with_errors(argv=[])
    assert rc == 0, \
        'Found %d code style errors / warnings:\n' % len(errors) + \
        '\n'.join(errors)

...
```

### src/ros2_ws/src/hardware_control_py/test/test_pep257.py
**状态**: added | **变更**: +23/-0

**Diff**:
```diff
@@ -0,0 +1,23 @@
+# Copyright 2015 Open Source Robotics Foundation, Inc.
+#
+# Licensed under the Apache License, Version 2.0 (the "License");
+# you may not use this file except in compliance with the License.
+# You may obtain a copy of the License at
+#
+#     http://www.apache.org/licenses/LICENSE-2.0
+#
+# Unless required by applicable law or agreed to in writing, software
+# distributed under the License is distributed on an "AS IS" BASIS,
+# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
+# See the License for the specific language governing permissions and
+# limitations under the License.
+
+from ament_pep257.main import main
+import pytest
+
+
+@pytest.mark.linter
+@pytest.mark.pep257
+def test_pep257():
+    rc = main(argv=['.', 'test'])
+    assert rc == 0, 'Found code style errors / warnings'

```

**文件内容** (预览):
```
# Copyright 2015 Open Source Robotics Foundation, Inc.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

from ament_pep257.main import main
import pytest


@pytest.mark.linter
@pytest.mark.pep257
def test_pep257():
    rc = main(argv=['.', 'test'])
    assert rc == 0, 'Found code style errors / warnings'

...
```

### src/ros2_ws/src/hardware_interface_py/hardware_interface_py/robot_interface.py
**状态**: undefined | **变更**: +1/-1

**Diff**:
```diff
@@ -106,7 +106,7 @@ class RobotInterface(Node):
         joint_state.position = []
 
         for i, obs in enumerate(obs_list):
-            joint_names = [f'{self.robots[i].name}.{key}' for key in obs if key.endswith(".pos")]
+            joint_names = [key for key in obs if key.endswith(".pos")]
 
             joint_state.name.extend(joint_names)
             joint_state.position.extend([obs[key] for key in obs if key.endswith(".pos")])

```

**文件内容** (预览):
```
# !/usr/bin/env python3
# -*- coding: utf-8 -*-
# @Time    : 2025/11/19 14:58
# @Author  : Yida Hao
# @File    : robot.py
# @Description : Robot hardware interface node aggregating all devices.

import os
if os.environ.get('LEROBOT_ROS2_LEROBOT_INJECTION', 'false') == 'true':
    import sys
    import yaml
    from ament_index_python.packages import get_package_share_directory
    config_path = get_package_share_directory('hardware_interface_py') + '/config/paths.yaml'
    with open(config_path, 'r') as f:
        config = yaml.safe_load(f)
        sys.path.insert(0, config['paths']['lerobot_deps_path']) if config['paths']['lerobot_deps_path'] not in sys.path else None
        sys.path.insert(0, config['paths']['lerobot_path']) if config['paths']['lerobot_path'] not in sys.path else None

    import lerobot
    print(f"lerobot path: {lerobot.__file__}")

from concurrent.futures import ThreadPoolExecutor
from rclpy.node import Node
from sensor_msgs.msg import JointState
from sensor_msgs.msg import Image
from lerobot.robots.robot import Robot
from cv_bridge import CvBridge

cvbridge = CvBridge()

# TODO: 将该前缀放到整个 workspace 的共享目录中
# 用来让其他节点识别到这是一个摄像头话题
CAMERA_PREFIX = "/camera/"

# Frequency to read motors
READING_FREQUENCY = 30  # Hz

class RobotInterface(Node):
    def __init__(self, robots: list[Robot]):
        super().__init__('RobotInterface')
        self.robots = robots
        
        for robot in self.robots:
            robot.connect()
            self.get_logger().info(f"Connected robot: {robot.name}")
        
        self.init_joint_state_publisher()
        self.init_joint_command_subscriber()
        self.init_camera_publishers()
        self.init_robot_reading_loop()


    def init_robot_reading_loop(self):
        self.timer = self.create_timer(1.0 / READING_FREQUENCY, self.read_robot)

    def init_joint_state_publisher(self):
        self.joint_state_publisher = self.create_publisher(
            JointState,
            'joint_states',
            10
        )

    def init_joint_command_subscriber(self):
        self.joint_command_subscriber = self.create_subscription(
            JointState,
            'joint_commands',
            self.joint_command_callback,
            10
        )

    def joint_command_callback(self, msg: JointState):
        for robot in self.robots:
            action_dict = {}
            
            for name, position in zip(msg.name, msg.position):
                if not name.startswith(robot.name):
                    return

                motor_name = name.removeprefix(f"{robot.name}.")
                action_dict[motor_name] = position
            
            robot.send_action(action_dict)
    
    def init_camera_publishers(self):
        self.cam_publishers = {}

        for robot in self.robots:
            if not hasattr(robot, "cameras") or len(robot.cameras) == 0:
                self.get_logger().warning(f"Robot {robot.name} has no cameras")
                continue
            
            for camera_name in robot.cameras:
                if camera_name in self.cam_publishers:
                    self.get_logger().error(f"Camera {camera_name} already exists")
                    return
                topic_name = CAMERA_PREFIX + camera_name
                self.cam_publishers[camera_name] = self.create_publisher(Image, topic_name, 10)

    def read_robot(self):
        with ThreadPoolExecutor() as executor:
...
```

### src/ros2_ws/src/interfaces/srv/PredJointAction.srv
**状态**: undefined | **变更**: +7/-2

**Diff**:
```diff
@@ -1,9 +1,14 @@
 # service type for request a predition based on current observation
 # currently only support joint actions, will be extended.
-
+# joint_state: current joint states
+# cam_images: current camera images
+# is_curr_pred_need_obs: whether the current prediction needs observation
+# joint_action: predicted joint actions
+# is_next_pred_need_obs: whether the next prediction needs observation  
 
 sensor_msgs/JointState joint_state
 interfaces/CamImages cam_images
+std_msgs/Bool is_curr_pred_need_obs
 ---
 sensor_msgs/JointState joint_action
-std_msgs/Int8 action_queue_length
\ No newline at end of file
+std_msgs/Bool is_next_pred_need_obs
\ No newline at end of file

```

**文件内容** (预览):
```
# service type for request a predition based on current observation
# currently only support joint actions, will be extended.
# joint_state: current joint states
# cam_images: current camera images
# is_curr_pred_need_obs: whether the current prediction needs observation
# joint_action: predicted joint actions
# is_next_pred_need_obs: whether the next prediction needs observation  

sensor_msgs/JointState joint_state
interfaces/CamImages cam_images
std_msgs/Bool is_curr_pred_need_obs
---
sensor_msgs/JointState joint_action
std_msgs/Bool is_next_pred_need_obs
...
```

### src/ros2_ws/src/policy_management/config/paths.yaml
**状态**: added | **变更**: +7/-0

**Diff**:
```diff
@@ -0,0 +1,7 @@
+# config assets file paths
+
+paths:
+  lerobot_path: "/home/ch3cooh/Workspace/oee-hw-private/lerobot" 
+  
+  lerobot_deps_path: "/home/ch3cooh/Software/miniconda3/envs/lerobot-ros2-torch-nightly/lib/python3.10/site-packages"
+   
\ No newline at end of file

```

**文件内容** (预览):
```
# config assets file paths

paths:
  lerobot_path: "/home/ch3cooh/Workspace/oee-hw-private/lerobot" 
  
  lerobot_deps_path: "/home/ch3cooh/Software/miniconda3/envs/lerobot-ros2-torch-nightly/lib/python3.10/site-packages"
   
...
```

### src/ros2_ws/src/policy_management/policy_management/__init__.py
**状态**: added | **变更**: +0/-0

**Diff**:
```diff
The file is empty
```

### src/ros2_ws/src/policy_management/policy_management/main.py
**状态**: added | **变更**: +30/-0

**Diff**:
```diff
@@ -0,0 +1,30 @@
+# !/usr/bin/env python3
+# -*- coding: utf-8 -*-
+# @Time    : 2025/07/25 9:00
+# @Author  : Yida Hao
+# @File    : main.py
+
+"""
+Main entry point for the policy management module.
+Launches the action prediction service
+"""
+
+import rclpy
+from rclpy.executors import MultiThreadedExecutor
+from policy_management.pred_joint_action_srv import PredJointActionService
+
+def main(args=None):
+    rclpy.init()
+
+    pred_action_service = PredJointActionService()
+    
+    # WARN: should use rclpy.spin while using Ascend om model, otherwise will get context errors
+    executor = MultiThreadedExecutor()
+    executor.add_node(pred_action_service)
+
+    executor.spin()
+
+    pred_action_service.destroy_node()
+
+    rclpy.shutdown()
+

```

**文件内容** (预览):
```
# !/usr/bin/env python3
# -*- coding: utf-8 -*-
# @Time    : 2025/07/25 9:00
# @Author  : Yida Hao
# @File    : main.py

"""
Main entry point for the policy management module.
Launches the action prediction service
"""

import rclpy
from rclpy.executors import MultiThreadedExecutor
from policy_management.pred_joint_action_srv import PredJointActionService

def main(args=None):
    rclpy.init()

    pred_action_service = PredJointActionService()
    
    # WARN: should use rclpy.spin while using Ascend om model, otherwise will get context errors
    executor = MultiThreadedExecutor()
    executor.add_node(pred_action_service)

    executor.spin()

    pred_action_service.destroy_node()

    rclpy.shutdown()


...
```

### src/ros2_ws/src/policy_management/policy_management/pred_joint_action_cli.py
**状态**: added | **变更**: +32/-0

**Diff**:
```diff
@@ -0,0 +1,32 @@
+#!/usr/bin/env python3
+# -*- coding: utf-8 -*-
+# @Time    : 2025/08/01 11:00
+# @Author  : Yida Hao
+# @File    : pred_joint_action_cli.py
+
+from rclpy.node import Node
+from interfaces.srv import PredJointAction
+from interfaces.msg import CamImages
+from sensor_msgs.msg import JointState
+
+"""
+Client for the predict joint action service.
+"""
+
+SRV_NAME = 'pred_joint_action_service'
+
+class PredJointActionClient(Node):
+    def __init__(self):
+        super().__init__(f'{SRV_NAME}_cli')
+        self.cli = self.create_client(PredJointAction, SRV_NAME)
+
+        while not self.cli.wait_for_service(timeout_sec=1.0):
+            self.get_logger().info('service not available, wating ...')
+        
+        self.req = PredJointAction.Request()
+        
+    def send_request(self, cam_imgs: CamImages, states: JointState):
+        self.req.cam_images = cam_imgs
+        self.req.joint_state = states
+        future = self.cli.call_async(self.req)
+        return future
\ No newline at end of file

```

**文件内容** (预览):
```
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# @Time    : 2025/08/01 11:00
# @Author  : Yida Hao
# @File    : pred_joint_action_cli.py

from rclpy.node import Node
from interfaces.srv import PredJointAction
from interfaces.msg import CamImages
from sensor_msgs.msg import JointState

"""
Client for the predict joint action service.
"""

SRV_NAME = 'pred_joint_action_service'

class PredJointActionClient(Node):
    def __init__(self):
        super().__init__(f'{SRV_NAME}_cli')
        self.cli = self.create_client(PredJointAction, SRV_NAME)

        while not self.cli.wait_for_service(timeout_sec=1.0):
            self.get_logger().info('service not available, wating ...')
        
        self.req = PredJointAction.Request()
        
    def send_request(self, cam_imgs: CamImages, states: JointState):
        self.req.cam_images = cam_imgs
        self.req.joint_state = states
        future = self.cli.call_async(self.req)
        return future
...
```

### src/ros2_ws/src/policy_management/policy_management/pred_joint_action_srv.py
**状态**: added | **变更**: +115/-0

**Diff**:
```diff
@@ -0,0 +1,115 @@
+#!/usr/bin/env python3
+# -*- coding: utf-8 -*-
+# @Time    : 2025/07/22 16:00
+# @Author  : Yida Hao
+# @File    : pred_joint_action_srv.py
+
+import os
+if os.environ.get('LEROBOT_ROS2_LEROBOT_INJECTION', 'false') == 'true':
+    import sys
+    import yaml
+    from ament_index_python.packages import get_package_share_directory
+    config_path = get_package_share_directory('policy_management') + '/config/paths.yaml'
+    with open(config_path, 'r') as f:
+        config = yaml.safe_load(f)
+        sys.path.insert(0, config['paths']['lerobot_deps_path']) if config['paths']['lerobot_deps_path'] not in sys.path else None
+        sys.path.insert(0, config['paths']['lerobot_path']) if config['paths']['lerobot_path'] not in sys.path else None
+
+
+from rclpy.node import Node
+from pathlib import Path
+from interfaces.srv import PredJointAction
+from interfaces.msg import CamImages
+from sensor_msgs.msg import JointState
+from std_msgs.msg import Bool
+
+from lerobot.datasets.utils import hw_to_dataset_features
+from lerobot.policies.factory import make_pre_post_processors
+from lerobot.policies.utils import build_inference_frame
+from lerobot.policies.act.modeling_act import ACTPolicy
+
+from torch import Tensor
+import torch
+
+from cv_bridge import CvBridge
+import numpy as np
+import lerobot
+
+print(f"lerobot path: {lerobot.__file__}")
+
+"""
+# Action prediction service. given robot observations, predict joint actions.
+"""
+
+# TODO: 使用 ros2 args 封装
+policy_path_act = Path("/home/ch3cooh/Workspace/TrainedModels/act_car_arm/pretrained_model")
+
+SRV_NAME = 'pred_joint_action_service'
+cvbridge = CvBridge()
+
+class PredJointActionService(Node):
+    def __init__(self):
+        super().__init__(f'{SRV_NAME}_srv')
+        policy_path = policy_path_act
+        self.policy = ACTPolicy.from_pretrained(policy_path)
+        self.preprocess, self.postprocess = make_pre_post_processors(self.policy.config, policy_path_act)
+
+        self.get_logger().info(f"ACT om enabled: {getattr(self.policy.config, 'is_ascend_om_enabled', False)}")
+
+        self.srv = self.create_service(PredJointAction, SRV_NAME, self.srv_callback)
+
+        self.get_logger().info(f"{ACTPolicy.__name__} loaded from {policy_path}")
+        self.get_logger().info(f"input features: {self.policy.config.input_features}")
+        self.get_logger().info(f"output features: {self.policy.config.output_features}")
+        self.get_logger().info("service ready")
+    
+    def srv_callback(self, request, response):
+        self.pred_action(request, response)
+        self.get_logger().info(f"service called, predicted action: {response.joint_action.position}")
+        return response
+
+    def pred_action(self, request, response):
+        self.get_logger().info("pred_action called")
+
+        obs = {}
+
+        if request.is_curr_pred_need_obs.data:
+            obs = self.make_obs(request.joint_state, request.cam_images)
+
+        action = self.policy.select_action(obs)
+        action = self.postprocess(action)
+
+        # Tensor -> sensor_msgs
+        response.joint_action = JointState()
+        response.joint_action.name = request.joint_state.name
+        response.is_next_pred_need_obs = Bool()
+        response.is_next_pred_need_obs.data = self.policy.is_next_pred_need_obs()
+        response.joint_action.position = action.detach().numpy().tolist()
+
+        self.get_logger().info(f'output action: {response.joint_action}')
+        
+        return response
+
+    def make_obs(self, states: JointState, cam_imgs: CamImages) -> dict[str, Tensor]:
+        obs = {}
+
+        # JointState -> Tensor
+        for i, name in enumerate(states.name):
+            obs[name] = torch.from_numpy(np.array(states.position[i], dtype=np.float32))
+
+        # Camera -> Tensor
+        for i, name in enumerate(cam_imgs.name):
+            image = cvbridge.imgmsg_to_cv2(cam_imgs.image[i])
+            image = np.array(image, dtype=np.uint8)
+            obs[name] = torch.from_numpy(image)
+
+        action_features = hw_to_dataset_features(self.policy.config.output_features, "action")
+        obs_features = hw_to_dataset_features(self.policy.config.input_features, "observation")
+        dataset_features = {**action_features, **obs_features}
+        obs_frame = build_inference_frame(
+            observation=obs, ds_features=dataset_features, device=torch.device('cuda') # TODO: device 支持配置
+        )
+        obs = self.preprocess(obs_frame)
+
+        return obs
+    
\ No newline at end of file

```

**文件内容** (预览):
```
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# @Time    : 2025/07/22 16:00
# @Author  : Yida Hao
# @File    : pred_joint_action_srv.py

import os
if os.environ.get('LEROBOT_ROS2_LEROBOT_INJECTION', 'false') == 'true':
    import sys
    import yaml
    from ament_index_python.packages import get_package_share_directory
    config_path = get_package_share_directory('policy_management') + '/config/paths.yaml'
    with open(config_path, 'r') as f:
        config = yaml.safe_load(f)
        sys.path.insert(0, config['paths']['lerobot_deps_path']) if config['paths']['lerobot_deps_path'] not in sys.path else None
        sys.path.insert(0, config['paths']['lerobot_path']) if config['paths']['lerobot_path'] not in sys.path else None


from rclpy.node import Node
from pathlib import Path
from interfaces.srv import PredJointAction
from interfaces.msg import CamImages
from sensor_msgs.msg import JointState
from std_msgs.msg import Bool

from lerobot.datasets.utils import hw_to_dataset_features
from lerobot.policies.factory import make_pre_post_processors
from lerobot.policies.utils import build_inference_frame
from lerobot.policies.act.modeling_act import ACTPolicy

from torch import Tensor
import torch

from cv_bridge import CvBridge
import numpy as np
import lerobot

print(f"lerobot path: {lerobot.__file__}")

"""
# Action prediction service. given robot observations, predict joint actions.
"""

# TODO: 使用 ros2 args 封装
policy_path_act = Path("/home/ch3cooh/Workspace/TrainedModels/act_car_arm/pretrained_model")

SRV_NAME = 'pred_joint_action_service'
cvbridge = CvBridge()

class PredJointActionService(Node):
    def __init__(self):
        super().__init__(f'{SRV_NAME}_srv')
        policy_path = policy_path_act
        self.policy = ACTPolicy.from_pretrained(policy_path)
        self.preprocess, self.postprocess = make_pre_post_processors(self.policy.config, policy_path_act)

        self.get_logger().info(f"ACT om enabled: {getattr(self.policy.config, 'is_ascend_om_enabled', False)}")

        self.srv = self.create_service(PredJointAction, SRV_NAME, self.srv_callback)

        self.get_logger().info(f"{ACTPolicy.__name__} loaded from {policy_path}")
        self.get_logger().info(f"input features: {self.policy.config.input_features}")
        self.get_logger().info(f"output features: {self.policy.config.output_features}")
        self.get_logger().info("service ready")
    
    def srv_callback(self, request, response):
        self.pred_action(request, response)
        self.get_logger().info(f"service called, predicted action: {response.joint_action.position}")
        return response

    def pred_action(self, request, response):
        self.get_logger().info("pred_action called")

        obs = {}

        if request.is_curr_pred_need_obs.data:
            obs = self.make_obs(request.joint_state, request.cam_images)

        action = self.policy.select_action(obs)
        action = self.postprocess(action)

        # Tensor -> sensor_msgs
        response.joint_action = JointState()
        response.joint_action.name = request.joint_state.name
        response.is_next_pred_need_obs = Bool()
        response.is_next_pred_need_obs.data = self.policy.is_next_pred_need_obs()
        response.joint_action.position = action.detach().numpy().tolist()

        self.get_logger().info(f'output action: {response.joint_action}')
        
        return response

    def make_obs(self, states: JointState, cam_imgs: CamImages) -> dict[str, Tensor]:
        obs = {}

        # JointState -> Tensor
        for i, name in enumerate(states.name):
            obs[name] = torch.from_numpy(np.array(states.position[i], dtype=np.float32))

        # Camera -> Tensor
...
```

### src/ros2_ws/src/policy_management/resource/policy_management
**状态**: added | **变更**: +0/-0

**Diff**:
```diff
The file is empty
```

### src/ros2_ws/src/policy_management/setup.cfg
**状态**: added | **变更**: +8/-0

**Diff**:
```diff
@@ -0,0 +1,8 @@
+[develop]
+script_dir=$base/lib/policy_management
+[install]
+install_scripts=$base/lib/policy_management
+[files]
+lerobot_dir=/test/lerobot_dir
+lerobot_dependencies_dir=/test/lerobot/dependencies_dir
+act_model_dir=/test/act

```

**文件内容** (预览):
```
[develop]
script_dir=$base/lib/policy_management
[install]
install_scripts=$base/lib/policy_management
[files]
lerobot_dir=/test/lerobot_dir
lerobot_dependencies_dir=/test/lerobot/dependencies_dir
act_model_dir=/test/act

...
```

### src/ros2_ws/src/policy_management/setup.py
**状态**: added | **变更**: +27/-0

**Diff**:
```diff
@@ -0,0 +1,27 @@
+from setuptools import find_packages, setup
+
+package_name = 'policy_management'
+
+setup(
+    name=package_name,
+    version='0.0.0',
+    packages=find_packages(exclude=['test']),
+    data_files=[
+        ('share/ament_index/resource_index/packages',
+            ['resource/' + package_name]),
+        ('share/' + package_name, ['package.xml']),
+        ('share/' + package_name + '/config', ['config/paths.yaml']),
+    ],
+    install_requires=['setuptools'],
+    zip_safe=True,
+    maintainer='ch3cooh',
+    maintainer_email='haoyida542@gmail.com',
+    description='TODO: Package description',
+    license='TODO: License declaration',
+    tests_require=['pytest'],
+    entry_points={
+        'console_scripts': [
+            'launch = policy_management.main:main',
+        ],
+    },
+)

```

**文件内容** (预览):
```
from setuptools import find_packages, setup

package_name = 'policy_management'

setup(
    name=package_name,
    version='0.0.0',
    packages=find_packages(exclude=['test']),
    data_files=[
        ('share/ament_index/resource_index/packages',
            ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
        ('share/' + package_name + '/config', ['config/paths.yaml']),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='ch3cooh',
    maintainer_email='haoyida542@gmail.com',
    description='TODO: Package description',
    license='TODO: License declaration',
    tests_require=['pytest'],
    entry_points={
        'console_scripts': [
            'launch = policy_management.main:main',
        ],
    },
)

...
```

### src/ros2_ws/src/policy_management/test/test_copyright.py
**状态**: added | **变更**: +25/-0

**Diff**:
```diff
@@ -0,0 +1,25 @@
+# Copyright 2015 Open Source Robotics Foundation, Inc.
+#
+# Licensed under the Apache License, Version 2.0 (the "License");
+# you may not use this file except in compliance with the License.
+# You may obtain a copy of the License at
+#
+#     http://www.apache.org/licenses/LICENSE-2.0
+#
+# Unless required by applicable law or agreed to in writing, software
+# distributed under the License is distributed on an "AS IS" BASIS,
+# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
+# See the License for the specific language governing permissions and
+# limitations under the License.
+
+from ament_copyright.main import main
+import pytest
+
+
+# Remove the `skip` decorator once the source file(s) have a copyright header
+@pytest.mark.skip(reason='No copyright header has been placed in the generated source file.')
+@pytest.mark.copyright
+@pytest.mark.linter
+def test_copyright():
+    rc = main(argv=['.', 'test'])
+    assert rc == 0, 'Found errors'

```

**文件内容** (预览):
```
# Copyright 2015 Open Source Robotics Foundation, Inc.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

from ament_copyright.main import main
import pytest


# Remove the `skip` decorator once the source file(s) have a copyright header
@pytest.mark.skip(reason='No copyright header has been placed in the generated source file.')
@pytest.mark.copyright
@pytest.mark.linter
def test_copyright():
    rc = main(argv=['.', 'test'])
    assert rc == 0, 'Found errors'

...
```

### src/ros2_ws/src/policy_management/test/test_flake8.py
**状态**: added | **变更**: +25/-0

**Diff**:
```diff
@@ -0,0 +1,25 @@
+# Copyright 2017 Open Source Robotics Foundation, Inc.
+#
+# Licensed under the Apache License, Version 2.0 (the "License");
+# you may not use this file except in compliance with the License.
+# You may obtain a copy of the License at
+#
+#     http://www.apache.org/licenses/LICENSE-2.0
+#
+# Unless required by applicable law or agreed to in writing, software
+# distributed under the License is distributed on an "AS IS" BASIS,
+# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
+# See the License for the specific language governing permissions and
+# limitations under the License.
+
+from ament_flake8.main import main_with_errors
+import pytest
+
+
+@pytest.mark.flake8
+@pytest.mark.linter
+def test_flake8():
+    rc, errors = main_with_errors(argv=[])
+    assert rc == 0, \
+        'Found %d code style errors / warnings:\n' % len(errors) + \
+        '\n'.join(errors)

```

**文件内容** (预览):
```
# Copyright 2017 Open Source Robotics Foundation, Inc.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

from ament_flake8.main import main_with_errors
import pytest


@pytest.mark.flake8
@pytest.mark.linter
def test_flake8():
    rc, errors = main_with_errors(argv=[])
    assert rc == 0, \
        'Found %d code style errors / warnings:\n' % len(errors) + \
        '\n'.join(errors)

...
```

### src/ros2_ws/src/policy_management/test/test_pep257.py
**状态**: added | **变更**: +23/-0

**Diff**:
```diff
@@ -0,0 +1,23 @@
+# Copyright 2015 Open Source Robotics Foundation, Inc.
+#
+# Licensed under the Apache License, Version 2.0 (the "License");
+# you may not use this file except in compliance with the License.
+# You may obtain a copy of the License at
+#
+#     http://www.apache.org/licenses/LICENSE-2.0
+#
+# Unless required by applicable law or agreed to in writing, software
+# distributed under the License is distributed on an "AS IS" BASIS,
+# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
+# See the License for the specific language governing permissions and
+# limitations under the License.
+
+from ament_pep257.main import main
+import pytest
+
+
+@pytest.mark.linter
+@pytest.mark.pep257
+def test_pep257():
+    rc = main(argv=['.', 'test'])
+    assert rc == 0, 'Found code style errors / warnings'

```

**文件内容** (预览):
```
# Copyright 2015 Open Source Robotics Foundation, Inc.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

from ament_pep257.main import main
import pytest


@pytest.mark.linter
@pytest.mark.pep257
def test_pep257():
    rc = main(argv=['.', 'test'])
    assert rc == 0, 'Found code style errors / warnings'

...
```


## PR 摘要

代码修改

## PR 信息

- **编号**: #58
- **标题**: feat: Periodically probe the latency of local inference and server inference
- **描述**: ## 目的：
最终为了实现一个基于“时延感知”的端云协同推理。当前PR实现定时探测 本地推理和服务器推理的时延。

## 说明
##### 当前PR实现说明：
* 1. 当前PR核心文件时`latency_prober.py`，其中核心函数为`_probe_loop()`。
* 2. `_probe_loop()`会被放到一个后台线程定时调用，用于定时探测 本地推理和服务器推理的时延。它的主体实现逻辑是定时调用`on_robot_inference.py::infer_chunk()`和`server_inference.py::infer_chunk()`拿到本地推理和服务器推理的时延，并对历史时延做加权平滑处理。
* 3. 后续将会实现一个基于推理时延的动态调度器，该调度器需要依赖当前PR的时延数据作出调度决策。

##### 运行效果图：
![image.png](https://raw.gitcode.com/user-images/assets/8744987/6aa6564c-b62c-43d0-988b-4ac928dadb85/image.png 'image.png')


## 变更文件

### src/lerobot/async_inference/configs.py
**状态**: undefined | **变更**: +13/-0

**Diff**:
```diff
@@ -25,6 +25,18 @@ from .constants import (
     DEFAULT_OBS_QUEUE_TIMEOUT,
 )
 
+
+@dataclass
+class LatencyConfig:
+    """时延探测与调度配置（本体优先核心）"""
+
+    on_robot_priority_threshold: int = 200  # 本体优先阈值(ms)
+    probe_interval: int = 5  # 探测周期(s)
+    min_switch_interval: int = 10  # 最小切换间隔(s)
+
+
+DEFAULT_LATENCY_CONFIG = LatencyConfig()
+
 # Aggregate function registry for CLI usage
 AGGREGATE_FUNCTIONS = {
     "weighted_average": lambda old, new: 0.3 * old + 0.7 * new,
@@ -110,6 +122,7 @@ class RobotClientConfig:
     # Policy configuration
     policy_type: str = field(metadata={"help": "Type of policy to use"})
     pretrained_name_or_path: str = field(metadata={"help": "Pretrained model name or path"})
+    pretrained_name_or_path_on_robot: str = field(metadata={"help": "Pretrained model name or path on robot"})
 
     # Robot configuration (for CLI usage - robot instance will be created from this)
     robot: RobotConfig = field(metadata={"help": "Robot configuration"})

```

### src/lerobot/async_inference/latency_prober.py
**状态**: added | **变更**: +209/-0

**Diff**:
```diff
@@ -0,0 +1,209 @@
+# Copyright 2026 The HuggingFace Inc. team. All rights reserved.
+#
+# Licensed under the Apache License, Version 2.0 (the "License");
+# you may not use this file except in compliance with the License.
+# You may obtain a copy of the License at
+#
+#     http://www.apache.org/licenses/LICENSE-2.0
+#
+# Unless required by applicable law or agreed to in writing, software
+# distributed under the License is distributed on an "AS IS" BASIS,
+# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
+# See the License for the specific language governing permissions and
+# limitations under the License.
+
+import threading
+import time
+from collections.abc import Callable
+from dataclasses import dataclass, field
+
+from lerobot.async_inference.configs import (
+    DEFAULT_LATENCY_CONFIG,
+    LatencyConfig,
+    RobotClientConfig,
+    get_aggregate_function,
+)
+from lerobot.async_inference.constants import SUPPORTED_ROBOTS
+from lerobot.async_inference.helpers import RawObservation, TimedObservation, get_logger
+from lerobot.async_inference.on_robot_inference import OnRobotInferenceEngine
+from lerobot.async_inference.server_inference import ServerInferenceEngine
+from lerobot.configs import parser
+from lerobot.robots.utils import make_robot_from_config
+
+"""
+Example command:
+```shell
+python ./src/lerobot/async_inference/latency_prober.py \
+    --server_address=192.168.1.100:9090 \
+    --robot.type=lekiwi \
+    --robot.port=/dev/ttyACM0 \
+    --robot.id=my_awesome_kiwi \
+    --robot.cameras="{ front: {type: opencv, index_or_path: '/dev/video0', width: 640, height: 480, fps: 60}, wrist: {type: opencv, index_or_path: '/dev/video2', width: 640, height: 480, fps: 30}}" \
+    --task="dummy" \
+    --policy_type=act \
+    --pretrained_name_or_path=/home/hezhenhao/workspace/model/pretrained_model \
+    --pretrained_name_or_path_on_robot=/root/workspace/model/pretrained_model \
+    --policy_device=cuda \
+    --actions_per_chunk=50 \
+    --chunk_size_threshold=0.5 \
+    --aggregate_fn_name=weighted_average \
+    --debug_visualize_queue_size=True
+```
+"""
+
+AGGREGATE_FUNC_NAME = "weighted_average"
+
+
+@dataclass
+class LatencyRecord:
+    """线程安全的时延记录"""
+
+    on_robot_latency: float = float("inf")
+    server_latency: float = float("inf")
+    last_probe_time: float = 0.0
+    last_switch_time: float = 0.0
+    lock: threading.Lock = field(default_factory=threading.Lock)  # 修改记录的同步锁
+
+
+class LatencyProber:
+    """时延探测类"""
+
+    logger = get_logger("latency_prober")
+
+    def __init__(
+        self,
+        latency_config: LatencyConfig,
+        on_robot_infer_func: Callable,
+        server_infer_func: Callable,
+        dummy_timed_obs: TimedObservation,
+    ):
+        self.config = latency_config
+        self.on_robot_infer = on_robot_infer_func
+        self.server_infer = server_infer_func
+        self.dummy_timed_obs = dummy_timed_obs
+        self.aggregate_fn = get_aggregate_function(AGGREGATE_FUNC_NAME)
+
+        # 时延状态
+        self.record = LatencyRecord()
+        self.is_running = False
+        self.probe_thread = threading.Thread(target=self._probe_loop, daemon=True)
+
+    def start(self):
+        """启动探测线程"""
+        self.is_running = True
+        self.probe_thread.start()
+
+    def stop(self):
+        """停止探测线程"""
+        self.is_running = False
+        self.probe_thread.join(timeout=(2 + self.config.probe_interval))
+        self.logger.info("End probe_thread.")
+
+    def _probe_single_latency(self, infer_func: Callable) -> float:
+        """探测单次推理时延（ms）"""
+        start = time.perf_counter()
+        _ = infer_func(self.dummy_timed_obs)  # 同步调用
+        return (time.perf_counter() - start) * 1000
+
+    def _probe_latency(self, infer_func: Callable) -> float:
+        """执行时延探测"""
+        # TODO：后续需要新增预热warmup逻辑
+        return self._probe_single_latency(infer_func)
+
+    def _probe_loop(self):
+        """周期性探测"""
+        while self.is_running:
+            # 1. 分别探测本体和服务器的时延
+            on_robot_lat = self._probe_latency(self.on_robot_infer)
+            server_lat = self._probe_latency(self.server_infer)
+            # 2. 更新记录（锁保护）
+            with self.record.lock:
+                if self.record.on_robot_latency == float("inf"):
+                    self.record.on_robot_latency = on_robot_lat
+                if self.record.server_latency == float("inf"):
+                    self.record.server_latency = server_lat
+                # 时延平滑：加权平均
+                self.record.on_robot_latency = self.aggregate_fn(self.record.on_robot_latency, on_robot_lat)
+                self.record.server_latency = self.aggregate_fn(self.record.server_latency, server_lat)
+                self.record.last_probe_time = time.perf_counter()
+            # 3. 打印结果
+            self.logger.info(f"实时时延 | 本体: {on_robot_lat:.2f}ms | 服务器: {server_lat:.2f}ms")
+            self.logger.info(
+                f"平均时延 | 本体: {self.record.on_robot_latency:.2f}ms | 服务器: {self.record.server_latency:.2f}ms"
+            )
+            self.logger.info("--------------------------------------------------")
+            # 4. 等待：避免频繁探测
+            time.sleep(self.config.probe_interval)
+
+    def get_latest_latency(self) -> LatencyRecord:
+        """获取最新时延"""
+        with self.record.lock:
+            return LatencyRecord(
+                on_robot_latency=self.record.on_robot_latency,
+                server_latency=self.record.server_latency,
+                last_probe_time=self.record.last_probe_time,
+                last_switch_time=self.record.last_switch_time,
+            )
+
+    def update_switch_time(self):
+        """更新切换时间"""
+        with self.record.lock:
+            self.record.last_switch_time = time.perf_counter()
+
+
+@parser.wrap()
+def test_latency_prober(cfg: RobotClientConfig):
+    if cfg.robot.type not in SUPPORTED_ROBOTS:
+        raise ValueError(f"Robot {cfg.robot.type} not yet supported!")
+
+    robot = make_robot_from_config(cfg.robot)
+    robot.connect()
+
+    on_robot_engine = OnRobotInferenceEngine(cfg, robot=robot)
+    server_engine = ServerInferenceEngine(cfg, robot=robot)
+
+    if server_engine.request_server_load_model():
+        server_engine.client_running = True
+    else:
+        raise RuntimeError("服务器推理引擎启动失败")
+
+    try:
+        latency_prober = LatencyProber(
+            latency_config=DEFAULT_LATENCY_CONFIG,
+            on_robot_infer_func=on_robot_engine.infer_chunk,
+            server_infer_func=server_engine.infer_chunk,
+            dummy_timed_obs=None,
+        )
+
+        raw_observation: RawObservation = None
+
+        start_time = time.perf_counter()
+        raw_observation = server_engine.client.robot.get_observation()
+        raw_observation["task"] = cfg.task
+        get_observation_time = time.perf_counter() - start_time
+        latency_prober.logger.info(f"client-server get_observation_time: {1000 * get_observation_time:.2f}ms")
+
+        timed_obs = TimedObservation(
+            timestamp=0,  # 占位值，当前场景不会使用到，随便设置一个值即可。
+            observation=raw_observation,
+            timestep=0,  # 占位值，当前场景不会使用到，随便设置一个值即可。
+        )
+
+        latency_prober.dummy_timed_obs = timed_obs
+        latency_prober.start()
+
+        latency_prober.logger.info("主线程开始休眠60s")
+        time.sleep(60)
+        latency_prober.logger.info("主线程休眠结束")
+
+    except KeyboardInterrupt:
+        latency_prober.logger.info("捕获到`Ctrl+C`中断")
+    finally:
+        # client.stop()里面已对robot关闭，后续robot不能被重复关闭。
+        server_engine.client.stop()
+        # on_robot_engine.robot.disconnect()
+        latency_prober.stop()
+
+
+if __name__ == "__main__":
+    test_latency_prober()  # 测试`latency_prober.py`的功能

```

### src/lerobot/async_inference/on_robot_inference.py
**状态**: undefined | **变更**: +24/-10

**Diff**:
```diff
@@ -40,7 +40,9 @@ from lerobot.robots import (
     make_robot_from_config,
 )
 from lerobot.robots.config import RobotConfig
+from lerobot.robots.robot import Robot
 from lerobot.utils.robot_utils import busy_wait
+from lerobot.utils.utils import auto_select_torch_device, is_torch_device_available
 
 """
 Example command:
@@ -50,7 +52,7 @@ python ./src/lerobot/async_inference/on_robot_inference.py \
     --robot.port=/dev/ttyACM0 \
     --robot.id=my_awesome_kiwi \
     --policy_type=act \
-    --pretrained_name_or_path=/root/workspace/model/pretrained_model \
+    --pretrained_name_or_path_on_robot=/root/workspace/model/pretrained_model \
     --policy_device=npu
 ```
 """
@@ -62,7 +64,7 @@ class OnRobotInferConfig:
 
     # Policy configuration
     policy_type: str = field(metadata={"help": "Type of policy to use"})
-    pretrained_name_or_path: str = field(metadata={"help": "Pretrained model name or path"})
+    pretrained_name_or_path_on_robot: str = field(metadata={"help": "Pretrained model name or path on robot"})
 
     # Robot configuration (for CLI usage - robot instance will be created from this)
     robot: RobotConfig = field(metadata={"help": "Robot configuration"})
@@ -76,17 +78,20 @@ class OnRobotInferenceEngine:
 
     """机器人本地推理引擎"""
 
-    def __init__(self, robot_config: RobotClientConfig):
+    def __init__(self, robot_config: RobotClientConfig, robot: Robot = None):
         self.robot_config = robot_config
 
         # Attributes will be set by RobotClientConfig
-        self.robot = make_robot_from_config(self.robot_config.robot)
-        self.robot.connect()
+        if robot is None:
+            self.robot = make_robot_from_config(self.robot_config.robot)
+            self.robot.connect()
+        else:
+            self.robot = robot
         self.device = robot_config.policy_device
         self.policy_type = robot_config.policy_type  # act, pi0, etc.
         self.lerobot_features = map_robot_keys_to_lerobot_features(self.robot)
         self.actions_per_chunk = robot_config.actions_per_chunk
-        self.pretrained_name_or_path = robot_config.pretrained_name_or_path
+        self.pretrained_name_or_path_on_robot = robot_config.pretrained_name_or_path_on_robot
         self.policy = None
         self.policy_image_features = None
         self.preprocessor: PolicyProcessorPipeline[dict[str, Any], dict[str, Any]] | None = None
@@ -94,19 +99,28 @@ class OnRobotInferenceEngine:
 
         self._load_model()
 
+    def _get_proper_device(self, try_device: str) -> str:
+        if is_torch_device_available(try_device):
+            return try_device
+        if is_torch_device_available("cuda"):
+            return "cuda"
+        if is_torch_device_available("npu"):
+            return "npu"
+        return str(auto_select_torch_device())
+
     def _load_model(self):
         policy_class = get_policy_class(self.policy_type)
 
         start = time.perf_counter()
-        self.policy = policy_class.from_pretrained(self.pretrained_name_or_path)
+        self.policy = policy_class.from_pretrained(self.pretrained_name_or_path_on_robot)
         self.policy.to(self.device)
         self.policy_image_features = self.policy.config.image_features
 
         # Load preprocessor and postprocessor, overriding device to match requested device
-        device_override = {"device": self.device}
+        device_override = {"device": self._get_proper_device(self.device)}
         self.preprocessor, self.postprocessor = make_pre_post_processors(
             self.policy.config,
-            pretrained_path=self.pretrained_name_or_path,
+            pretrained_path=self.pretrained_name_or_path_on_robot,
             # The inference device is automatically set to match the detected hardware, overriding any previous device settings from training to ensure compatibility.
             preprocessor_overrides={"device_processor": device_override},
             postprocessor_overrides={"device_processor": device_override},
@@ -210,7 +224,7 @@ def main(on_robot_infer_config: OnRobotInferConfig):
         robot=on_robot_infer_config.robot,
         policy_device=on_robot_infer_config.policy_device,
         policy_type=on_robot_infer_config.policy_type,
-        pretrained_name_or_path=on_robot_infer_config.pretrained_name_or_path,
+        pretrained_name_or_path_on_robot=on_robot_infer_config.pretrained_name_or_path_on_robot,
         chunk_size_threshold=0.5,
         actions_per_chunk=50,  # make sure this is less than the max actions of the policy
     )

```

### src/lerobot/async_inference/robot_client.py
**状态**: undefined | **变更**: +70/-3

**Diff**:
```diff
@@ -84,7 +84,7 @@ class RobotClient:
     prefix = "robot_client"
     logger = get_logger(prefix)
 
-    def __init__(self, config: RobotClientConfig):
+    def __init__(self, config: RobotClientConfig, robot: Robot = None, thread_control: bool = False):
         """Initialize RobotClient with unified configuration.
 
         Args:
@@ -92,8 +92,11 @@ class RobotClient:
         """
         # Store configuration
         self.config = config
-        self.robot = make_robot_from_config(config.robot)
-        self.robot.connect()
+        if robot is None:
+            self.robot = make_robot_from_config(config.robot)
+            self.robot.connect()
+        else:
+            self.robot = robot
 
         lerobot_features = map_robot_keys_to_lerobot_features(self.robot)
 
@@ -136,6 +139,8 @@ class RobotClient:
         self.must_go = threading.Event()
         self.must_go.set()  # Initially set - observations qualify for direct processing
 
+        self.thread_control = thread_control
+
     @property
     def running(self):
         return not self.shutdown_event.is_set()
@@ -170,6 +175,39 @@ class RobotClient:
             self.logger.error(f"Failed to connect to policy server: {e}")
             return False
 
+    def start_threads(self):
+        if self.thread_control:
+            # 创建和启动receive_actions_thread
+            self.receive_actions_thread = threading.Thread(target=self.receive_actions, daemon=True)
+            self.receive_actions_thread.start()
+            self.pause_event_receive_actions = threading.Event()
+            self.pause_event_receive_actions.set()
+
+            # 创建和启动control_loop_thread
+            self.control_loop_thread = threading.Thread(
+                target=self.control_loop, kwargs={"task": self.config.task}, daemon=True
+            )
+            self.control_loop_thread.start()
+            self.pause_event_control_loop = threading.Event()
+            self.pause_event_control_loop.set()
+
+    def pause_receive_actions_thread(self):
+        if self.thread_control:
+            self.pause_event_receive_actions.clear()
+
+    def resume_receive_actions_thread(self):
+        if self.thread_control:
+            self.pause_event_receive_actions.set()
+
+    def pause_control_loop_thread(self):
+        # 注意：在调用当前方法停止control_loop_thread线程之前，建议必须先停止receive_actions_thread线程，避免再往action_queue里面塞东西。
+        if self.thread_control:
+            self.pause_event_control_loop.clear()
+
+    def resume_control_loop_thread(self):
+        if self.thread_control:
+            self.pause_event_control_loop.set()
+
     def stop(self):
         """Stop the robot client"""
         self.shutdown_event.set()
@@ -180,6 +218,21 @@ class RobotClient:
         self.channel.close()
         self.logger.debug("Client stopped, channel closed")
 
+    def stop_threads(self):
+        # 先调stop
+        self.stop()
+        if self.thread_control:
+            # 先调stop，后调resume，能保证线程的内部循环可以马上跳出循环。
+            self.resume_receive_actions_thread()
+            self.resume_control_loop_thread()
+
+            self.receive_actions_thread.join()
+            self.control_loop_thread.join()
+            self.logger.info("join receive_actions_thread and control_loop_thread.")
+        if self.config.debug_visualize_queue_size and self.action_queue.qsize() > 0:
+            visualize_action_queue_size(self.action_queue_size)
+            self.logger.info("Client stopped")
+
     def send_observation(
         self,
         obs: TimedObservation,
@@ -273,6 +326,13 @@ class RobotClient:
         self.logger.info("Action receiving thread starting")
 
         while self.running:
+            if self.thread_control:
+                # 检查是否需要暂停（若 pause_event 未设置，则阻塞）
+                self.pause_event_receive_actions.wait()  # 暂停时阻塞，恢复时继续
+                # 先检查是否还需要running，这是为了在进程退出时，对线程进行stop和join操作时能马上join成功。
+                if not self.running:
+                    break
+
             try:
                 # Use StreamActions to get a stream of actions from the server
                 actions_chunk = self.stub.GetActions(services_pb2.Empty())
@@ -450,6 +510,13 @@ class RobotClient:
         _captured_observation = None
 
         while self.running:
+            if self.thread_control:
+                # 检查是否需要暂停（若 pause_event 未设置，则阻塞）
+                self.pause_event_control_loop.wait()  # 暂停时阻塞，恢复时继续
+                # 先检查是否还需要running，这是为了在进程退出时，对线程进行stop和join操作时能马上join成功。
+                if not self.running:
+                    break
+
             control_loop_start = time.perf_counter()
             """Control loop: (1) Performing actions, when available"""
             if self.actions_available():

```

### src/lerobot/async_inference/server_inference.py
**状态**: undefined | **变更**: +35/-2

**Diff**:
```diff
@@ -13,6 +13,7 @@
 # limitations under the License.
 
 import pickle  # nosec
+from queue import Empty
 
 import grpc
 
@@ -26,6 +27,7 @@ from lerobot.async_inference.helpers import (
     get_logger,
 )
 from lerobot.async_inference.robot_client import RobotClient
+from lerobot.robots.robot import Robot
 from lerobot.transport import services_pb2
 from lerobot.transport.utils import send_bytes_in_chunks
 
@@ -35,13 +37,44 @@ class ServerInferenceEngine:
 
     logger = get_logger("server_infer")
 
-    def __init__(self, robot_config: RobotClientConfig):
-        self.client = RobotClient(robot_config)
+    def __init__(self, robot_config: RobotClientConfig, robot: Robot = None, thread_control: bool = False):
+        self.client = RobotClient(robot_config, robot=robot, thread_control=thread_control)
         self.client_running = False
 
     def request_server_load_model(self):
         return self.client.start()
 
+    def start_client(self):
+        return self.client.start_threads()
+
+    def pause_client(self):
+        """1. 发送停止receive_actions_thread线程的信号"""
+        self.client.pause_receive_actions_thread()
+
+        """2.1 清空action_queue。注意要先停止receive_actions_thread线程。"""
+        # 注意：在调用当前方法停止control_loop_thread线程之前，建议必须先停止receive_actions_thread线程，避免再往action_queue里面塞东西。
+        self.logger.info(f"Begin to clean action_queue, now size is: {self.client.action_queue.qsize()}")
+        with self.client.action_queue_lock:
+            while True:
+                try:
+                    # get_nowait函数里面的配置项为：block=False，非阻塞获取，队列为空时抛出 Empty 异常
+                    _ = self.client.action_queue.get_nowait()
+                except Empty:
+                    # 捕获异常说明队列已空，退出循环
+                    break
+        self.logger.info(f"Clean action_queue, now size is: {self.client.action_queue.qsize()}")
+
+        """2.2 停止小车"""
+        if hasattr(self.client.robot, "stop_base") and callable(self.client.robot.stop_base):
+            self.client.robot.stop_base()  # 需要马上停止小车
+
+        """2.3 发送停止control_loop_thread线程的信号"""
+        self.client.pause_control_loop_thread()
+
+    def resume_client(self):
+        self.client.resume_receive_actions_thread()
+        self.client.resume_control_loop_thread()
+
     def infer_chunk(self, timed_obs: TimedObservation) -> list[TimedAction]:
         """用于探测服务器推理时延的专用方法"""
         try:

```


## PR 摘要

新增功能
