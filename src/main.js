import {createApp} from 'vue'
import App from './App.vue'
import './styles/theme.css'
import './styles/lite.css'
import Lemon from './utils/lemon'
import {loadSandboxRoot} from './utils/sandbox'

window.Lemon = Lemon

createApp(App).mount('#app')
loadSandboxRoot()
