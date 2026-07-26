import glob, re

for fname in glob.glob("patch-plan*.sh"):
    with open(fname, "r") as f:
        lines = f.readlines()
    
    with open(fname, "w") as f:
        for line in lines:
            if line.startswith("sed -i 's/"):
                # Use a proper regex to find the components
                # sed -i 's/<PATTERN>/<REPLACEMENT>/g' <FILE>
                
                # Split by unescaped /
                parts = re.split(r'(?<!\\)/', line)
                
                # parts[0] = sed -i 's
                # parts[1] = pattern
                # parts[2] = replacement
                # parts[3] = g' FILE
                
                if len(parts) >= 4:
                    pattern = parts[1]
                    
                    if not pattern.startswith("^"):
                        pattern = "^" + pattern
                    if not pattern.endswith("$"):
                        pattern = pattern + "$"
                        
                    parts[1] = pattern
                    f.write("/".join(parts))
                else:
                    f.write(line)
            else:
                f.write(line)
