/**
 * 工具清单：仪表盘「已安装环境」与侧边导航共用的一份定义。
 *
 * 加新工具时只改这里：
 *  - check  : preload 暴露的检测方法名（没有就不写，仪表盘不会展示它）
 *  - switch / remove : 切换版本 / 卸载
 *  - service: 需要起停的常驻服务（MySQL、Redis）
 *  - isSimple: 只装一个版本、没有版本列表的工具（Maven）
 */
import JavaIcon from '/icons/java.svg?url';
import PythonIcon from '/icons/Python.svg?url';
import MysqlIcon from '/icons/mysql.svg?url';
import RedisIcon from '/icons/Redis.svg?url';
import MavenIcon from '/icons/maven.svg?url';
import GradleIcon from '/icons/gradle.svg?url';
import NodejsIcon from '/icons/nodejs.svg?url';
import NginxIcon from '/icons/nginx.svg?url';
import GolangIcon from '/icons/Golang.svg?url';
import MinicondaIcon from '/icons/Miniconda.svg?url';
import JupyterIcon from '/icons/Jupyter.svg?url';
import NacosIcon from '/icons/nacos.svg?url';
import SentinelIcon from '/icons/sentinel.svg?url';
import RabbitmqIcon from '/icons/Rabbitmq.svg?url';
import MinioIcon from '/icons/minio.svg?url';
import ElasticsearchIcon from '/icons/elasticsearch.svg?url';
import KibanaIcon from '/icons/kibana.svg?url';
import CIcon from '/icons/c.svg?url';

export const TOOLS = [
  // ── 前端开发 ──
  {
    id: 'nodejs', name: 'Node.js', group: 'frontend', icon: NodejsIcon,
    check: 'checkNodejs', switch: 'switchNodejs', remove: 'uninstallNodejs'
  },
  {
    id: 'nginx', name: 'Nginx', group: 'frontend', icon: NginxIcon,
    check: 'checkNginx', switch: 'switchNginx', remove: 'uninstallNginx'
  },

  // ── 后端开发 ──
  {
    id: 'jdk', name: 'JDK', group: 'backend', icon: JavaIcon,
    check: 'checkJDK', switch: 'switchJDK', remove: 'deleteJDK'
  },
  {
    id: 'maven', name: 'Maven', group: 'backend', icon: MavenIcon, isSimple: true,
    check: 'checkMaven', switch: 'switchMaven', remove: 'uninstallMaven'
  },
  {
    id: 'gradle', name: 'Gradle', group: 'backend', icon: GradleIcon,
    check: 'checkGradle', switch: 'switchGradle', remove: 'uninstallGradle'
  },
  { id: 'go', name: 'Go', group: 'backend', icon: GolangIcon },
  {
    id: 'python', name: 'Python', group: 'backend', icon: PythonIcon,
    check: 'checkPython', switch: 'switchPython', remove: 'deletePython'
  },
  {
    id: 'uv', name: 'uv', group: 'backend', icon: '/icons/uv.svg',
    check: 'checkUv', switch: 'switchUv', remove: 'uninstallUv'
  },
  { id: 'miniconda', name: 'Miniconda', group: 'backend', icon: MinicondaIcon },
  { id: 'jupyter', name: 'Jupyter Lab', group: 'backend', icon: JupyterIcon },

  // ── 数据库 ──
  {
    id: 'mysql', name: 'MySQL', group: 'database', icon: MysqlIcon,
    check: 'checkMySQL', switch: 'switchMySQL', remove: 'deleteMySQL',
    service: {
      status: 'getMySQLServiceStatus', start: 'startMySQLService', stop: 'stopMySQLService'
    }
  },
  {
    id: 'redis', name: 'Redis', group: 'database', icon: RedisIcon,
    check: 'checkRedis', switch: 'switchRedis', remove: 'deleteRedis',
    service: {
      status: 'getRedisServiceStatus', start: 'startRedisService', stop: 'stopRedisService'
    }
  },

  // ── 中间件 ──
  { id: 'nacos', name: 'Nacos', group: 'middleware', icon: NacosIcon },
  { id: 'sentinel', name: 'Sentinel', group: 'middleware', icon: SentinelIcon },
  { id: 'rabbitmq', name: 'RabbitMQ', group: 'middleware', icon: RabbitmqIcon },
  { id: 'minio', name: 'MinIO', group: 'middleware', icon: MinioIcon },
  { id: 'elasticsearch', name: 'Elasticsearch', group: 'middleware', icon: ElasticsearchIcon },
  { id: 'kibana', name: 'Kibana', group: 'middleware', icon: KibanaIcon },

  // ── 编译工具 ──
  { id: 'mingw', name: 'MinGW', group: 'toolchain', icon: CIcon }
];

/** 具备检测能力的工具才能出现在仪表盘（其余只在导航里进入安装面板）。 */
export const DASHBOARD_TOOLS = TOOLS.filter((tool) => Boolean(tool.check));

/** 按 id 取工具定义。 */
export function findTool(id) {
  return TOOLS.find((tool) => tool.id === id) || null;
}
