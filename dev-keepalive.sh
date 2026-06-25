#!/bin/bash
cd /home/z/my-project
while true; do
  echo "[$(date)] starting dev server..." >> dev.log
  bun run dev >> dev.log 2>&1
  echo "[$(date)] dev server exited with $?, restarting in 3s..." >> dev.log
  sleep 3
done
