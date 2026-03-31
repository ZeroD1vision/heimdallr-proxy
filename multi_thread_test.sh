# 1. Настройки (замени на свои)
URL="http://127.0.0.1:3000/api/stats"
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0ZWxlZ3JhbV9pZCI6MTIzNTI5NTE4MSwiZXhwIjoxNzc1MDM4MDE5LCJpYXQiOjE3NzQ5NTE2MTl9.U7tfG-wOlRoRVWtYgEV41ihqcaii8vnCpjCXVyVu3-U"
COUNT=20  # сколько запросов отправить в параллель

# 2. Цикл запуска
echo "Запуск $COUNT запросов..."
for i in $(seq 1 $COUNT); do
    curl -s -X GET "$URL" \
         -H "Authorization: Bearer $TOKEN" \
         -H "Content-Type: application/json" \
         -d '{"data": "test"}' \
         -w "Запрос $i | Статус: %{http_code} | Время: %{time_total}s\n" \
         -o /dev/null & 
done

# 3. Ждем завершения всех фоновых процессов
wait
echo "Готово."
