"""Stage compiled PCF files for Microsoft's SolutionPackager / pac solution pack.
Usage: python scripts/stage-solution.py staging-folder [managed|unmanaged]
Then: pac solution pack --folder staging-folder --zipfile component.zip --packagetype Unmanaged
"""
from pathlib import Path
import shutil
import sys
import xml.etree.ElementTree as ET
root = Path(__file__).resolve().parents[1]
stage = Path(sys.argv[1]).resolve()
managed = len(sys.argv) > 2 and sys.argv[2].lower() == 'managed'
if stage == root or root in stage.parents and stage.parts[-1] in ('src', 'pcf', 'deployment'):
    raise SystemExit('Use a dedicated staging directory.')
name = 'cnowrm_ChoctawNationOWRM.WaterRateStudyTool'
shutil.copytree(root / 'pcf/Solutions/src', stage, dirs_exist_ok=True)
control = stage / 'Controls' / name
shutil.copytree(root / 'pcf/out/controls/WaterRateStudyTool', control, dirs_exist_ok=True)
solution = stage / 'Other/Solution.xml'
tree = ET.parse(solution)
tree.getroot().find('.//Managed').text = '1' if managed else '0'
components = tree.getroot().find('.//RootComponents')
components.clear()
ET.SubElement(components, 'RootComponent', {'type': '66', 'schemaName': name, 'behavior': '0'})
tree.write(solution, encoding='utf-8', xml_declaration=True)
# SolutionPackager reads this metadata sidecar; without it the fallback Name
# incorrectly contains a trailing .xml and differs from the root component.
metadata = ET.Element('CustomControl', {'Name': name, 'CompatibleDataTypes': '0'})
ET.SubElement(metadata, 'FileName').text = '/Controls/' + name + '/ControlManifest.xml'
ET.ElementTree(metadata).write(control / 'ControlManifest.xml.data.xml', encoding='utf-8', xml_declaration=True)
print(stage)
