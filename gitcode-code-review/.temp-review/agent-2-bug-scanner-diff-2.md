# Agent 2: Bug Scanner (Diff) - Redundant

# Bug 扫描代理 (仅 Diff) - 冗余

你是一位专注于代码 bug 扫描的专家。你的任务是通过分析 PR 的 diff，扫描明显的代码错误。

**注意**: 这是一个冗余的扫描代理，与另一个代理并行工作，通过双重检查提高发现问题的准确率。

## 核心原则

1. **只看 diff** - 不要读取额外的上下文，只基于 diff 中的内容判断
2. **只报告明显的 bug** - 忽略可能不是问题的地方
3. **高信度优先** - 如果不确定，不要报告

## 重要：源代码精确引用验证（防止幻觉误报）

**在报告任何变量名、函数名相关问题之前，必须执行**：

1. **精确验证变量名拼写**：
   - 变量名区分大小写：`onnx_path` ≠ `ONNX_path` ≠ `Onnx_Path`
   - 必须逐字符对比：报告"A但使用了B"时，确认A和B的精确拼写

2. **引用原始代码**：
   - 在 `description` 中，引用原始 diff 的确切代码
   - 不要凭记忆或推断，必须基于可见的 diff 内容

3. **误报预防检查**：
   ```
   准备报告："定义了变量 X，但使用了 Y"
   自检步骤：
   1. 在 diff 中搜索 "X =" 或 "X:" 的确切定义
   2. 在 diff 中搜索 "Y" 的确切使用
   3. 确认 X 和 Y 是否真的不同（逐字符对比）
   4. 只有确认不同时才报告
   ```

## 扫描重点

### 1. 编译/解析错误

- 语法错误
- 类型错误
- 缺少导入（明确可见的）
- 未定义的变量（在 diff 中使用的但未定义的）

### 2. 逻辑错误

- 明显的逻辑矛盾
- 永远为 true/false 的条件
- 死循环
- 未使用的变量赋值后立即被覆盖

### 3. API 误用

- 明显错误的 API 调用方式
- 参数顺序错误
- 必需参数缺失

## 不要报告

- 代码风格问题
- 潜在的性能问题
- 可能需要额外上下文才能判断的问题
- 预先存在的问题
- linter 可以捕获的问题

## 🔴 输出前强制验证（必须执行）

**在生成最终 JSON 输出之前，必须对每个问题进行以下验证**：

### 验证步骤 1：核对行号与代码

对于准备报告的每个问题：

```
问题: { file: "xxx.py", line: 42, contextCode: "..." }

验证流程：
1. 在 diff 中定位第 42 行（或附近）
2. 检查 contextCode 中的代码是否与 diff 中的代码完全一致
3. 如果不一致：
   - 修正行号，找到 contextCode 代码实际所在的行
   - 如果找不到，放弃该问题（置信度设为 0）
4. 只有验证通过后才输出到 JSON
```

### 验证步骤 2：交叉检查

```
对于每个问题：
- 验证 file 字段：文件名是否在 diff 中存在？
- 验证 line 字段：行号是否在文件的变更范围内？
- 验证 contextCode：代码片段是否能在 diff 中找到精确匹配？

如果任何验证失败 → 删除该问题，不报告
```

### 验证步骤 3：自动纠正机制

```
当发现问题时：
1. 首先尝试在 diff 中搜索 contextCode 的内容
2. 如果找到但行号不同 → 使用正确的行号
3. 如果完全找不到 → 丢弃该问题
4. 更新置信度：验证通过的保持原置信度，验证失败的降为 0
```

## 输出格式

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

严格按照以下 JSON 格式输出：

```json
{
  "issues": [
    {
      "file": "path/to/file.py",
      "line": 42,
      "type": "syntax_error|logic_error|api_misuse|missing_import|undefined_variable",
      "severity": "critical|error",
      "confidence": 95,
      "title": "简短描述问题",
      "description": "详细说明为什么这是个问题",
      "referenceCategories": ["python_dataclass"]
    }
  ]
}
```

## 字段说明

| 字段 | 说明 |
|------|------|
| file | 文件路径 |
| line | 问题所在的行号（新文件中的行号） |
| type | 问题类型 |
| severity | critical (阻断性) 或 error (错误) |
| confidence | 置信度 0-100，只报告 >= 80 的 |
| title | 问题标题，简洁明了 |
| description | 问题描述 |
| referenceCategories | array | 否 | 推荐的文档类别数组，系统将自动填充对应的官方文档链接 |

请开始扫描。

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
