#!/usr/bin/env bash

# Create a temporary directory for screen captures
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

# Get monitor info in JSON
MONITORS=$(hyprctl monitors -j)

# Prepare the magick command
# We'll create a canvas based on the maximum bounds
MAX_X=0
MAX_Y=0

# Loop through each monitor and capture
while read -r monitor; do
    NAME=$(echo "$monitor" | jq -r '.name')
    WIDTH=$(echo "$monitor" | jq -r '.width')
    HEIGHT=$(echo "$monitor" | jq -r '.height')
    X=$(echo "$monitor" | jq -r '.x')
    Y=$(echo "$monitor" | jq -r '.y')
    
    # Track the bounding box
    [[ $((X + WIDTH)) -gt $MAX_X ]] && MAX_X=$((X + WIDTH))
    [[ $((Y + HEIGHT)) -gt $MAX_Y ]] && MAX_Y=$((Y + HEIGHT))
    
    # Capture the monitor
    echo "Capturing $NAME ($WIDTH x $HEIGHT) at +$X+$Y..."
    grim -o "$NAME" "$TMP_DIR/$NAME.png"
    
    # Add a label to the image so we know which is which
    # We use a semi-transparent box for the label
    magick "$TMP_DIR/$NAME.png" \
        -gravity center -pointsize 100 -fill white -undercolor '#00000080' \
        -annotate +0+0 "$NAME\n(${X}, ${Y})" \
        "$TMP_DIR/${NAME}_labeled.png"
        
done < <(echo "$MONITORS" | jq -c '.[]')

# Stitch them all together on a single canvas
# We start with a black background of the total size
echo "Stitching monitors into logical_layout.png..."
MAGICK_CMD="magick -size ${MAX_X}x${MAX_Y} xc:black -set colorspace sRGB"
while read -r monitor; do
    NAME=$(echo "$monitor" | jq -r '.name')
    X=$(echo "$monitor" | jq -r '.x')
    Y=$(echo "$monitor" | jq -r '.y')
    MAGICK_CMD="$MAGICK_CMD \( $TMP_DIR/${NAME}_labeled.png -geometry +$X+$Y \) -composite"
done < <(echo "$MONITORS" | jq -c '.[]')
MAGICK_CMD="$MAGICK_CMD logical_layout.png"

eval $MAGICK_CMD

echo "Done! Check logical_layout.png"
