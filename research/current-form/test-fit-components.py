"""Guard and selection tests for the post hoc component comparison."""
import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location('component_fit', Path(__file__).with_name('fit-components.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def candidate(mask, frozen, pre=0.0, other=0.0, fold=0.0):
    cell = lambda delta: {'candidate': {'loss': .4 + delta}, 'reference': {'loss': .4}}
    return {'mask': mask, 'frozen': {'difference': frozen, 'candidate': .7 + frozen},
            'ordinary': {'preCombined': cell(pre), 'postCombined': cell(other), 'qual': cell(other)},
            'folds': [{'from': year, 'ordinary': {'preCombined': cell(fold), 'postCombined': cell(fold), 'qual': cell(fold)}}
                      for year in (2008, 2012, 2016, 2021)]}

both = candidate('both', -.018, pre=-.0003)
assert all(module.followup_checks(both).values())
assert not module.followup_checks(candidate('driver', -.009))['frozenGain']
assert not module.followup_checks(candidate('driver', -.02, pre=.0001))['preCombined']
assert not module.followup_checks(candidate('driver', -.02, other=.0011))['qualPooled']
assert not module.followup_checks(candidate('driver', -.02, fold=.0031))['2012.preCombined']
assert module.choose({'both': both, 'driver': candidate('driver', -.02, pre=-.0004)})['mask'] == 'driver'
assert module.choose({'both': candidate('both', -.009)}) is None
print('Current form component selection tests passed')
