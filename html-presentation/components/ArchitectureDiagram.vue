<template>
  <div class="architecture-diagram">
    <svg viewBox="0 0 800 400" class="w-full h-auto">
      <!-- Background -->
      <rect x="0" y="0" width="800" height="400" fill="#f8fafc" rx="15"/>

      <!-- Title -->
      <text x="400" y="35" text-anchor="middle" font-size="18" font-weight="900" fill="#1e293b">
        {{ title || '异构SoC架构' }}
      </text>

      <!-- ARM Core -->
      <g transform="translate(50, 100)" class="core-group">
        <rect width="200" height="220" fill="#6366f1" rx="15"/>
        <text x="100" y="100" text-anchor="middle" fill="white" font-size="24" font-weight="900">ARM大核</text>
        <text x="100" y="130" text-anchor="middle" fill="white" font-size="16" font-weight="600">(性能核心)</text>
        <text x="100" y="170" text-anchor="middle" fill="rgba(255,255,255,0.8)" font-size="14">控制面</text>
        <text x="100" y="190" text-anchor="middle" fill="rgba(255,255,255,0.8)" font-size="14">状态机</text>
      </g>

      <!-- RISC-V Core -->
      <g transform="translate(550, 100)" class="core-group">
        <rect width="200" height="220" fill="#10b981" rx="15"/>
        <text x="100" y="100" text-anchor="middle" fill="white" font-size="24" font-weight="900">RISC-V小核</text>
        <text x="100" y="130" text-anchor="middle" fill="white" font-size="16" font-weight="600">(能效核心)</text>
        <text x="100" y="170" text-anchor="middle" fill="rgba(255,255,255,0.8)" font-size="14">数据面</text>
        <text x="100" y="190" text-anchor="middle" fill="rgba(255,255,255,0.8)" font-size="14">自定义指令</text>
      </g>

      <!-- Shared Memory -->
      <g transform="translate(275, 240)">
        <rect width="250" height="80" fill="#f59e0b" rx="12"/>
        <text x="125" y="35" text-anchor="middle" fill="white" font-size="18" font-weight="900">统一内存池</text>
        <text x="125" y="60" text-anchor="middle" fill="white" font-size="14" font-weight="600">UVA / UMA</text>
      </g>

      <!-- Connection Lines -->
      <line x1="250" y1="210" x2="275" y2="280" stroke="#cbd5e1" stroke-width="4" stroke-dasharray="8,4"/>
      <line x1="550" y1="210" x2="525" y2="280" stroke="#cbd5e1" stroke-width="4" stroke-dasharray="8,4"/>

      <!-- Arrows -->
      <polygon points="275,280 265,270 285,270" fill="#cbd5e1"/>
      <polygon points="525,280 515,270 535,270" fill="#cbd5e1"/>
    </svg>
  </div>
</template>

<script setup>
import { defineProps } from 'vue'

defineProps({
  title: {
    type: String,
    default: '异构SoC架构'
  }
})
</script>

<style scoped>
.architecture-diagram {
  @apply rounded-lg shadow-lg p-6 bg-white;
}

.core-group {
  transition: transform 0.3s ease;
}

.core-group:hover {
  transform: translateY(-5px);
}

.core-group rect {
  filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.1));
}
</style>
