#!/bin/bash
# Bash local testing script for Meewav MVT Server
echo -e "\e[36m====================================================================\e[0m"
echo -e "\e[36mRUNNING MEEWAV MVT SERVER DIAGNOSTICS (BASH)\e[0m"
echo -e "\e[36m====================================================================\e[0m"

# 1. Health check
echo -e "\n\e[33m[1/3] Testing /health endpoint...\e[0m"
curl -i http://localhost:5000/health
echo

# 2. Parallel JSON API
echo -e "\n\e[33m[2/3] Testing /api/musicians_api JSON endpoint...\e[0m"
curl -i http://localhost:5000/api/musicians_api
echo

# 3. MVT Tile download
echo -e "\n\e[33m[3/3] Requesting MVT tile /musicians_clustered/16/33193/22545...\e[0m"
rm -f test.mvt
curl -i http://localhost:5000/musicians_clustered/16/33193/22545 --output test.mvt

if [ -f test.mvt ]; then
    size=$(wc -c < test.mvt)
    if [ "$size" -gt 0 ]; then
        echo -e "\e[32mSuccess! 'test.mvt' downloaded successfully.\e[0m"
        echo -e "\e[32mFile size: $size bytes\e[0m"
    else
        echo -e "\e[31mWarning: 'test.mvt' was downloaded but is empty (0 bytes).\e[0m"
    fi
else
    echo -e "\e[31mError: Failed to download 'test.mvt'.\e[0m"
fi

echo -e "\n\e[36m====================================================================\e[0m"
echo -e "\e[36mDIAGNOSTICS COMPLETED\e[0m"
echo -e "\e[36m====================================================================\e[0m"
