// src/request.js（新增，极简封装，适配你的工程）
import axios from 'axios'

// 统一管理后端基础地址，修改时仅需改此处
const baseUrl = 'http://localhost:3000'

// 极简POST请求方法，你的登录页直接调用
export const post = (url, data) => {
  return axios.post(baseUrl + url, data)
}
