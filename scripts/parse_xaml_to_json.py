#!/usr/bin/env python3
"""
Fixed script to parse MainWindow.xaml and extract the Insert menu structure to JSON format.
This version properly handles unlimited nesting levels.
"""

import xml.etree.ElementTree as ET
import json
import re
from typing import Dict, List, Any, Optional, Union

def clean_header(header: str) -> str:
    """Clean header text by removing resource references and extracting readable names."""
    if not header:
        return ""
    
    # Remove resource binding syntax like {x:Static wpf:ConstantsResources.Constants_Header}
    if header.startswith("{") and header.endswith("}"):
        # Extract the last part after the last dot
        match = re.search(r'\.([^.}]+)}$', header)
        if match:
            result = match.group(1)
            # Convert PascalCase to readable format
            result = re.sub(r'([A-Z]+)([A-Z][a-z])', r'\1 \2', result)
            result = re.sub(r'([a-z\d])([A-Z])', r'\1 \2', result)
            result = result.replace('_', ' ')
            return result
    
    return header

def clean_tag(tag: str) -> str:
    """Clean tag by unescaping XML entities."""
    if not tag:
        return ""
    
    # Unescape XML entities
    tag = tag.replace('&lt;', '<')
    tag = tag.replace('&gt;', '>')
    tag = tag.replace('&amp;', '&')
    tag = tag.replace('&quot;', '"')
    tag = tag.replace('&apos;', "'")
    
    return tag

def extract_lines_from_file(file_path: str, start_line: int, end_line: int) -> str:
    """Extract specific lines from a file."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        
        # Convert to 0-based indexing
        start_idx = start_line - 1
        end_idx = end_line
        
        if start_idx < 0 or end_idx > len(lines):
            raise ValueError(f"Line range {start_line}-{end_line} is out of bounds for file with {len(lines)} lines")
        
        # Extract the lines and join them
        extracted_lines = lines[start_idx:end_idx]
        return ''.join(extracted_lines)
    
    except Exception as e:
        print(f"Error reading file: {e}")
        return ""

def parse_menu_item_recursive(item: ET.Element) -> Optional[Union[Dict[str, Any], List[Dict[str, Any]]]]:
    """Parse a single MenuItem element recursively with proper nesting handling."""
    # Skip separators
    if item.tag.endswith('Separator'):
        return None
    
    # Get attributes
    header = item.get('Header', '')
    tag = item.get('Tag', '')
    click = item.get('Click', '')
    tooltip = item.get('ToolTip', '')
    
    # Clean the values
    clean_header_text = clean_header(header)
    clean_tag_text = clean_tag(tag)
    clean_tooltip_text = clean_header(tooltip) if tooltip else ""
    
    # If this item has a Click attribute and Tag, it's a leaf item
    if click == 'Button_Click' and tag:
        item_data = {
            'tag': clean_tag_text,
            'description': clean_header_text
        }
        
        # Use Icon property as label if it exists
        icon = item.get('Icon', '')
        if icon:
            item_data['label'] = icon
        
        return item_data
    
    # Check if this item has children
    children = [child for child in item if child.tag.endswith('MenuItem')]
    
    if not children:
        # No children, not a clickable item - skip
        return None
    
    # This item has children - it's a container
    # Separate leaf items from subcategories
    leaf_items = []
    subcategories = {}
    
    for child in children:
        parsed_child = parse_menu_item_recursive(child)
        if parsed_child is None:
            continue
        
        child_header = clean_header(child.get('Header', ''))
        child_click = child.get('Click', '')
        child_tag = child.get('Tag', '')
        
        # If child has Click and Tag, it's a leaf item
        if child_click == 'Button_Click' and child_tag:
            leaf_items.append(parsed_child)
        else:
            # Child is a subcategory
            if child_header:
                subcategories[child_header] = parsed_child
    
    # Decide how to structure the result
    if leaf_items and subcategories:
        # Both leaf items and subcategories - put leaf items under 'direct'
        result = {'direct': leaf_items}
        result.update(subcategories)
        return result
    elif leaf_items and not subcategories:
        # Only leaf items - return as array
        return leaf_items
    elif subcategories and not leaf_items:
        # Only subcategories - return as object
        return subcategories
    else:
        # No valid children
        return None

def parse_xaml_insert_menu(xaml_content: str) -> Dict[str, Any]:
    """Parse the XAML content and extract the Insert menu structure."""
    try:
        # Wrap the content in a root element to make it valid XML
        wrapped_content = f"<root xmlns:x='http://schemas.microsoft.com/winfx/2006/xaml' xmlns:wpf='clr-namespace:Calcpad.Wpf'>{xaml_content}</root>"
        
        root = ET.fromstring(wrapped_content)
        
        result = {}
        
        # Find the direct MenuItem children of the root - these are our main sections
        for menu_item in root:
            if not menu_item.tag.endswith('MenuItem'):
                continue
                
            header = menu_item.get('Header', '')
            if not header:
                continue
            
            # Use the cleaned header as the key
            section_key = clean_header(header)
            
            print(f"Found main section: {section_key}")
            parsed_section = parse_menu_item_recursive(menu_item)
            if parsed_section:
                result[section_key] = parsed_section
        
        return result
    
    except ET.ParseError as e:
        print(f"Error parsing XML: {e}")
        return {}
    except Exception as e:
        print(f"Error: {e}")
        return {}

def main():
    xaml_file = "/home/isaiahmartin/vscode-calcpad/helper/Calcpad.Wpf/MainWindow.xaml"
    start_line = 260
    end_line = 1677
    
    print(f"Extracting lines {start_line}-{end_line} from MainWindow.xaml...")
    xaml_content = extract_lines_from_file(xaml_file, start_line, end_line)
    
    if not xaml_content:
        print("Failed to extract XAML content")
        return
    
    print("Parsing extracted XAML content...")
    result = parse_xaml_insert_menu(xaml_content)
    
    if result:
        # Write to a new JSON file
        output_file = "/home/isaiahmartin/vscode-calcpad/parsed_templates_fixed.json"
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        
        print(f"Successfully parsed XAML and wrote to {output_file}")
        
        # Print summary
        for section, data in result.items():
            if isinstance(data, list):
                print(f"{section}: {len(data)} items")
            elif isinstance(data, dict):
                def count_nested_items(obj, depth=0):
                    count = 0
                    if isinstance(obj, list):
                        count += len(obj)
                    elif isinstance(obj, dict):
                        for key, value in obj.items():
                            if isinstance(value, list):
                                count += len(value)
                            elif isinstance(value, dict):
                                count += count_nested_items(value, depth + 1)
                    return count
                
                item_count = count_nested_items(data)
                print(f"{section}: {len(data)} categories, {item_count} total items")
            else:
                print(f"{section}: {type(data)}")
    else:
        print("No menu structure found")

if __name__ == "__main__":
    main()