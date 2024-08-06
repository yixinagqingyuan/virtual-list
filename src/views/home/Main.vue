<!-- @format -->

<script setup lang="ts">
import GithubCorner from '../../components/Corner.vue'
import ApiDoc from '../../docs/api.md'
import { ref } from 'vue'
const paddingTop = ref(0)
const scroll = (e) => {
  if (e.target.scrollTop % 200 < 20) {
    paddingTop.value = e.target.scrollTop
  }
}
</script>

<template>
  <div class="example">
    <GithubCorner />
    <ApiDoc />
    <div class="warp" @scroll="scroll">
      <div class="scroll-box" :style="`padding-top:${paddingTop}px`">
        <div class="test-item">这是测试 item</div>
        <div class="test-item">这是测试 item</div>
        <div class="test-item">这是测试 item</div>
        <div class="test-item">这是测试 item</div>
        <div class="test-item">这是测试 item</div>
        <div class="test-item">这是测试 item</div>
        <div class="test-item">这是测试 item</div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.warp {
  height: 300px;
  width: 500px;
  border: 1px solid #000;
  overflow: auto;
  margin-top: 100px;
  margin-left: 100px;
  .scroll-box {
    height: 6000px;
  }
}
</style>
