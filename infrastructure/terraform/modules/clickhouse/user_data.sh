#!/bin/bash
set -euo pipefail

# Update system
yum update -y
yum install -y docker

# Start Docker
systemctl enable docker
systemctl start docker

# Mount data volume
mkfs -t xfs /dev/xvdb || true
mkdir -p /var/lib/clickhouse
mount /dev/xvdb /var/lib/clickhouse
echo '/dev/xvdb /var/lib/clickhouse xfs defaults,nofail 0 2' >> /etc/fstab

# Create ClickHouse config
mkdir -p /etc/clickhouse-server
cat > /etc/clickhouse-server/config.xml << 'EOF'
<?xml version="1.0"?>
<clickhouse>
    <logger>
        <level>information</level>
        <console>1</console>
    </logger>
    <http_port>8123</http_port>
    <tcp_port>9000</tcp_port>
    <listen_host>::</listen_host>
    <max_connections>4096</max_connections>
    <keep_alive_timeout>3</keep_alive_timeout>
    <max_concurrent_queries>100</max_concurrent_queries>
    <path>/var/lib/clickhouse/</path>
    <tmp_path>/var/lib/clickhouse/tmp/</tmp_path>
    <user_files_path>/var/lib/clickhouse/user_files/</user_files_path>
    <mark_cache_size>5368709120</mark_cache_size>
    <mmap_cache_size>1000</mmap_cache_size>
    
    <merge_tree>
        <max_suspicious_broken_parts>5</max_suspicious_broken_parts>
    </merge_tree>
    
    <default_profile>default</default_profile>
    <default_database>agentops</default_database>
    
    <profiles>
        <default>
            <max_memory_usage>10000000000</max_memory_usage>
            <use_uncompressed_cache>0</use_uncompressed_cache>
            <load_balancing>random</load_balancing>
        </default>
    </profiles>
    
    <users>
        <default>
            <password></password>
            <networks>
                <ip>::/0</ip>
            </networks>
            <profile>default</profile>
            <quota>default</quota>
        </default>
    </users>
    
    <quotas>
        <default>
            <interval>
                <duration>3600</duration>
                <queries>0</queries>
                <errors>0</errors>
                <result_rows>0</result_rows>
                <read_rows>0</read_rows>
                <execution_time>0</execution_time>
            </interval>
        </default>
    </quotas>
</clickhouse>
EOF

# Run ClickHouse
docker run -d \
  --name clickhouse \
  --restart unless-stopped \
  -p 8123:8123 \
  -p 9000:9000 \
  -v /var/lib/clickhouse:/var/lib/clickhouse \
  -v /etc/clickhouse-server:/etc/clickhouse-server \
  clickhouse/clickhouse-server:24.3

# Wait for ClickHouse to start
sleep 10

# Initialize database
docker exec clickhouse clickhouse-client --query "CREATE DATABASE IF NOT EXISTS agentops"

echo "ClickHouse initialization complete"
