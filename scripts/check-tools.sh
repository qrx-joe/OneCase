#!/usr/bin/env bash
# 开工前环境自检：通用工具 + 本系统专属。
# 用法：bash scripts/check-tools.sh
# 全部通过退出码 0；有缺失退出码 1（可被脚本/CI 前置步骤使用）。

fail=0

check() {
  # $1=命令名 $2=取版本的表达式 $3=必需 yes/no（默认 yes）
  local name="$1" probe="$2" required="${3:-yes}"
  if command -v "$name" >/dev/null 2>&1; then
    echo "OK   $name: $(eval "$probe" 2>/dev/null | head -n 1)"
  else
    if [ "$required" = "yes" ]; then
      echo "MISS $name 未安装（必需）"
      fail=1
    else
      echo "OPT  $name 未安装（可选）"
    fi
  fi
}

echo "== 通用 =="
check git "git --version"

echo "== 本系统专属 =="
check node "node --version"
check pnpm "pnpm --version"

# 版本下限：package.json engines 要求 node>=18 / pnpm>=8；
# CI 锁 node 22 / pnpm 10；.nvmrc 锁 22。
if command -v node >/dev/null 2>&1; then
  major=$(node -p 'process.versions.node.split(".")[0]')
  if [ "$major" -lt 18 ]; then
    echo "MISS node 主版本 $major < 18（engines 下限）；CI 用 22，建议 nvm use（见 .nvmrc）"
    fail=1
  elif [ "$major" -ne 22 ]; then
    echo "WARN node 主版本 $major != CI 的 22 —— 本地/CI 行为差异先怀疑版本"
  fi
fi

if [ "$fail" -eq 0 ]; then
  echo "== 全部通过 =="
else
  echo "== 有缺失，见上 =="
fi
exit $fail
