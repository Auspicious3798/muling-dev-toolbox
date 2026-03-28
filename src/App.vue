<template>
  <div class="container">
    <div class="card">
      <h1>🍋 沐柠开发工具箱</h1>
      <div class="subtitle">一键安装 · 极速配置</div>

      <JDKInstaller />

      <div class="software-item">
        <h3>🐍 Python</h3>
        <select disabled><option>即将支持</option></select>
        <button disabled style="background-color:#a0aec0;">即将推出</button>
        <div class="status">敬请期待</div>
        <div class="coming-soon">后续版本将支持 Python 一键安装</div>
      </div>

      <div class="software-item">
        <h3>🗄️ MySQL</h3>
        <select disabled><option>即将支持</option></select>
        <button disabled style="background-color:#a0aec0;">即将推出</button>
        <div class="status">敬请期待</div>
        <div class="coming-soon">后续版本将支持 MySQL 一键安装</div>
      </div>
    </div>
  </div>
</template>

<script>
import JDKInstaller from './components/JDKInstaller.vue';

export default {
  name: 'App',
  components: {
    JDKInstaller
  }
};
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
body {
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  background: #f0f2f5;
  padding: 20px;
}
.container {
  max-width: 700px;
  margin: 0 auto;
}
.card {
  background: white;
  border-radius: 16px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  padding: 24px;
  margin-bottom: 20px;
}
h1 {
  font-size: 28px;
  color: #1e2a3a;
  margin-bottom: 8px;
}
.subtitle {
  color: #5a6e7a;
  margin-bottom: 24px;
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 12px;
}
.software-item {
  border-top: 1px solid #e2e8f0;
  padding: 20px 0;
}
.software-item:first-child {
  border-top: none;
}
h3 {
  font-weight: 600;
  font-size: 18px;
  margin-bottom: 12px;
}
select {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid #cbd5e0;
  font-size: 14px;
  margin-right: 12px;
}
button {
  background-color: #2c7a4d;
  color: white;
  border: none;
  padding: 8px 20px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  transition: background 0.2s;
}
button:hover:not(:disabled) {
  background-color: #1f5e3a;
}
.coming-soon {
  background: #fef9e6;
  border-left: 4px solid #f5b042;
  padding: 12px;
  margin-top: 12px;
  border-radius: 8px;
  font-size: 13px;
  color: #b16e0c;
}
.status {
  margin-top: 12px;
  font-size: 14px;
  color: #4a5568;
}
</style>