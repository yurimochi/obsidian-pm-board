#!/usr/bin/env bash
# Claude Code status line: context-window "weather", usage, 12-turn sparkline, last-turn delta.
# Reads the status-line JSON on stdin; history comes from the session transcript,
# so it refreshes on every turn without any state of its own.
input=$(cat)
transcript=$(jq -r '.transcript_path // empty' <<<"$input")
size=$(jq -r '.context_window.context_window_size // 200000' <<<"$input")

# Tokens in context after each model call (one entry per message id), last 12.
used=()
if [ -n "$transcript" ] && [ -f "$transcript" ]; then
  mapfile -t used < <(jq -rs '
    [ .[] | select(.type=="assistant" and .message.usage != null)
      | {id: .message.id, t: (.message.usage
          | (.input_tokens // 0) + (.cache_creation_input_tokens // 0)
          + (.cache_read_input_tokens // 0) + (.output_tokens // 0))} ]
    | reduce .[] as $m ([]; if length > 0 and .[-1].id == $m.id then .[-1] = $m else . + [$m] end)
    | map(.t) | .[-12:] | .[]' "$transcript" 2>/dev/null)
fi
fmt() { awk -v v="$1" 'BEGIN{ if (v>=1000000) printf "%.1fM", v/1e6; else if (v>=1000) { s=sprintf("%.1fk", v/1e3); sub(/\.0k/,"k",s); printf "%s", s } else printf "%d", v }'; }
n=${#used[@]}
if [ "$n" -eq 0 ]; then printf '\033[33m☀ Clear\033[0m  0%% · 0 / %s' "$(fmt "$size")"; exit 0; fi

cur=${used[$((n-1))]}
pct=$(( cur * 100 / size ))


if   [ "$pct" -ge 90 ]; then c='\033[31m'; label='↯ Compact soon'
elif [ "$pct" -ge 75 ]; then c='\033[35m'; label='⛈ Storm'
elif [ "$pct" -ge 50 ]; then c='\033[34m'; label='☂ Showers'
elif [ "$pct" -ge 25 ]; then c='\033[36m'; label='☁ Cloudy'
else                         c='\033[33m'; label='☀ Clear'; fi

bars=(▁ ▂ ▃ ▄ ▅ ▆ ▇ █)
chart=""
for v in "${used[@]}"; do
  i=$(( v * 8 / size )); [ "$i" -gt 7 ] && i=7
  chart+="${bars[$i]}"
done

out="${c}${label}\033[0m  ${pct}% · $(fmt "$cur") / $(fmt "$size")  ${c}${chart}\033[0m"
if [ "$n" -ge 2 ]; then
  d=$(( cur - used[n-2] ))
  if [ "$d" -ge 0 ]; then out+="  ▲ +$(fmt "$d") last turn"; else out+="  ▼ -$(fmt $(( -d ))) last turn"; fi
fi
printf '%b' "$out"
